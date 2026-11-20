import { useEffect, useRef } from "react";
import { api } from "../api/client";
import type { SaveStatusByStage } from "./saveStatus";

const AUTOSAVE_DELAY_MS = 1500;

export type FlushPreservedDrafts = (preservesStage: (stage: number) => boolean) => Promise<boolean>;

type DraftSaveResponse = {
  ok?: boolean;
  applied?: boolean;
  revision?: number;
  projectGeneration?: number;
  componentsRevision?: number;
};

export function useAutosaveDraft<TDraft>(options: {
  classId: string | undefined;
  labId: string;
  saveStatus: string;
  stageIndex: number;
  draftOf: (stageIndex: number) => TDraft | undefined;
  expectedRevisionOf: (stageIndex: number) => number;
  expectedComponentsRevisionOf?: () => number;
  componentsSeqOf?: () => number;
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  dirtyStages?: number[];
  saveStatuses?: SaveStatusByStage;
  flushPreservedDrafts?: { current: FlushPreservedDrafts | null };
  holdSend?: (stageIndex: number, draft: TDraft) => boolean;
  deps?: unknown[];
  expectedGeneration?: number;
  resetVersion?: number;
  onSaving: (stageIndex: number) => void;
  onSaved: (
    stageIndex: number,
    revision?: number,
    componentsRevision?: number,
    componentsSeq?: number,
  ) => void;
  onError: (stageIndex: number) => void;
  onConflict?: (stageIndex: number) => void;
}): void {
  const { classId, labId, saveStatus, stageIndex, deps = [], resetVersion = 0 } = options;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const latestArm = useRef(new Map<number, number>());
  const queuedArm = useRef(new Map<number, number>());
  const inFlight = useRef(new Set<number>());
  const requests = useRef(new Map<number, Promise<void>>());
  const failedStages = useRef(new Set<number>());
  const appliedRev = useRef(new Map<number, number>());
  const appliedGeneration = useRef(0);
  const appliedComponentsRev = useRef(0);
  // Project-wide fence on the shared library: a refused component-carrying
  // write blocks EVERY later component-carrying send until the lesson
  // state resyncs both the library snapshot and its revision (the reported
  // counter is the resync target, not an adopted revision).
  const componentsFenceRev = useRef<number | null>(null);
  const componentsInFlight = useRef(false);
  const conflicted = useRef(new Set<number>());
  const armSeq = useRef(0);
  // The request body and expectedRevision are built when a request sends,
  // not when it armed — reads always go through the latest committed options.
  const latestOptions = useRef(options);
  // Which classId the lesson state on screen belongs to. On a class switch
  // the first render still carries the previous class's save flags — arming
  // then would PUT a stale snapshot under the new class. The cleanup effect
  // below re-points this ref right after the arm effect re-runs on that
  // commit (creates run in declaration order), so only dirty flags raised
  // under the new state arm saves.
  const armedClass = useRef(classId);
  const generation = useRef(0);

  useEffect(() => {
    latestOptions.current = options;
  });

  const armDraft = useRef(new Map<number, { stage: number; draft: TDraft }>());

  const flushQueuedArms = () => {
    for (const [queuedStage, queued] of [...queuedArm.current]) {
      if (inFlight.current.has(queuedStage)) continue;
      const armClass = armedClass.current;
      if (armClass === undefined) continue;
      queuedArm.current.delete(queuedStage);
      sendNow(queuedStage, queued, armClass);
    }
  };

  const sendNow = (stage: number, arm: number, armClass: string) => {
    const opts = latestOptions.current;
    const entry = armDraft.current.get(arm);
    if (!entry || entry.stage !== stage) return;
    const draft = entry.draft;
    if (opts.holdSend?.(stage, draft)) {
      const prev = queuedArm.current.get(stage);
      if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
      queuedArm.current.set(stage, arm);
      return;
    }
    const expectedRevision = Math.max(
      appliedRev.current.get(stage) ?? 0,
      opts.expectedRevisionOf(stage),
    );
    const body = {
      ...(opts.bodyFor ? opts.bodyFor(stage, draft) : { stageIndex: stage, draft }),
      expectedRevision,
      ...(opts.expectedGeneration !== undefined
        ? { expectedGeneration: opts.expectedGeneration }
        : {}),
    } as Record<string, unknown>;
    const carriesComponents = body.components !== undefined;
    let sentComponentsSeq: number | undefined;
    if (carriesComponents && opts.expectedComponentsRevisionOf) {
      body.expectedComponentsRevision = Math.max(
        appliedComponentsRev.current,
        opts.expectedComponentsRevisionOf(),
      );
      sentComponentsSeq = opts.componentsSeqOf?.();
      const fenceRev = componentsFenceRev.current;
      if (fenceRev !== null && opts.expectedComponentsRevisionOf() < fenceRev) {
        const prev = queuedArm.current.get(stage);
        if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
        queuedArm.current.set(stage, arm);
        return;
      }
      if (componentsInFlight.current) {
        const prev = queuedArm.current.get(stage);
        if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
        queuedArm.current.set(stage, arm);
        return;
      }
      componentsInFlight.current = true;
    }
    const gen = generation.current;
    inFlight.current.add(stage);
    opts.onSaving(stage);
    const request = api
      .put<DraftSaveResponse>(`/api/classes/${armClass}/labs/${labId}/draft`, body)
      .then((result) => {
        if (generation.current !== gen) return;
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        if (carriesComponents) componentsInFlight.current = false;
        const rev = typeof result?.revision === "number" ? result.revision : undefined;
        if (rev !== undefined) {
          appliedRev.current.set(stage, Math.max(appliedRev.current.get(stage) ?? 0, rev));
        }
        const genNum =
          typeof result?.projectGeneration === "number" ? result.projectGeneration : undefined;
        if (genNum !== undefined) {
          appliedGeneration.current = Math.max(appliedGeneration.current, genNum);
        }
        const componentsRev =
          typeof result?.componentsRevision === "number" ? result.componentsRevision : undefined;
        // Only our own APPLIED write raises the counter we claim: a refusal
        // merely reports where the server stands, and adopting that number
        // without the matching snapshot is the stale-list overwrite hole —
        // the fence below holds every component send until the reconcile
        // lands both the library and its revision.
        if (componentsRev !== undefined && result?.applied !== false) {
          appliedComponentsRev.current = Math.max(appliedComponentsRev.current, componentsRev);
        }
        // The server refused the write — it already holds a newer draft
        // from elsewhere. Fence the stage BEFORE touching the queue: a
        // queued or still-debouncing arm would resend with the reconciled
        // expectedRevision on content that predates it and silently
        // overwrite the winning write. Kill every pending path for the
        // stage (their snapshots are dead), then report the conflict — even
        // when a newer local arm exists, since the bypassed-write window is
        // exactly what must never stay silent.
        if (result?.applied === false) {
          failedStages.current.add(stage);
          if (componentsRev !== undefined) {
            componentsFenceRev.current = Math.max(componentsFenceRev.current ?? 0, componentsRev);
          }
          conflicted.current.add(stage);
          const pendingTimer = timers.current.get(stage);
          if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            timers.current.delete(stage);
          }
          const pendingArm = latestArm.current.get(stage);
          if (pendingArm !== undefined) armDraft.current.delete(pendingArm);
          latestArm.current.delete(stage);
          const queued = queuedArm.current.get(stage);
          if (queued !== undefined) {
            queuedArm.current.delete(stage);
            armDraft.current.delete(queued);
          }
          flushQueuedArms();
          opts.onConflict?.(stage);
          return;
        }
        failedStages.current.delete(stage);
        flushQueuedArms();
        if (latestArm.current.get(stage) !== arm) return;
        opts.onSaved(stage, rev, componentsRev, sentComponentsSeq);
      })
      .catch(() => {
        if (generation.current !== gen) return;
        failedStages.current.add(stage);
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        if (carriesComponents) componentsInFlight.current = false;
        flushQueuedArms();
        if (latestArm.current.get(stage) === arm) opts.onError(stage);
      })
      .finally(() => {
        if (requests.current.get(stage) === request) requests.current.delete(stage);
      });
    requests.current.set(stage, request);
  };

  useEffect(() => {
    if (armedClass.current !== classId || !classId) return;
    const saveStatuses = latestOptions.current.saveStatuses;
    const backgroundDirty = saveStatuses
      ? Object.keys(saveStatuses)
          .map(Number)
          .filter((stage) => saveStatuses[stage] === "dirty")
      : (latestOptions.current.dirtyStages ?? []);
    const stages = [
      ...(saveStatus === "dirty" ? [stageIndex] : []),
      ...backgroundDirty.filter((s) => s !== stageIndex),
    ];
    for (const stage of stages) {
      if (conflicted.current.has(stage)) {
        const revFenced =
          latestOptions.current.expectedRevisionOf(stage) < (appliedRev.current.get(stage) ?? 0);
        const genFenced =
          (latestOptions.current.expectedGeneration ?? 0) < appliedGeneration.current;
        if (revFenced || genFenced) continue;
        conflicted.current.delete(stage);
      }
      const draft = latestOptions.current.draftOf(stage);
      if (draft === undefined) continue;
      const pendingArm = latestArm.current.get(stage);
      const pendingTimer = timers.current.get(stage);
      if (pendingArm !== undefined && armDraft.current.get(pendingArm)?.draft === draft) {
        continue;
      }
      const arm = ++armSeq.current;
      latestArm.current.set(stage, arm);
      armDraft.current.set(arm, { stage, draft });
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        if (pendingArm !== undefined) armDraft.current.delete(pendingArm);
      }
      const supersededQueued = queuedArm.current.get(stage);
      if (supersededQueued !== undefined) {
        queuedArm.current.delete(stage);
        armDraft.current.delete(supersededQueued);
      }
      const timer = setTimeout(() => {
        timers.current.delete(stage);
        if (inFlight.current.has(stage)) {
          const prev = queuedArm.current.get(stage);
          if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
          queuedArm.current.set(stage, arm);
          return;
        }
        sendNow(stage, arm, classId);
      }, AUTOSAVE_DELAY_MS);
      timers.current.set(stage, timer);
    }
  }, [saveStatus, stageIndex, classId, labId, ...deps]);

  useEffect(() => {
    const target = options.flushPreservedDrafts;
    if (!target) return;
    target.current = async (preservesStage) => {
      const startGeneration = generation.current;
      const armClass = armedClass.current;
      if (armClass === undefined) return false;
      const failed = () => [...failedStages.current].some(preservesStage);
      const unsynced = Object.entries(latestOptions.current.saveStatuses ?? {}).some(
        ([stage, status]) =>
          preservesStage(Number(stage)) &&
          ["error", "conflict", "sync-error"].includes(status ?? ""),
      );
      if (unsynced) return false;

      while (generation.current === startGeneration) {
        for (const [stage, timer] of timers.current) {
          if (!preservesStage(stage)) continue;
          const arm = latestArm.current.get(stage);
          if (arm === undefined) continue;
          clearTimeout(timer);
          timers.current.delete(stage);
          queuedArm.current.set(stage, arm);
        }
        flushQueuedArms();
        const pending = [...requests.current].filter(([stage]) => preservesStage(stage));
        const queued = [...queuedArm.current.keys()].some(preservesStage);
        if (pending.length === 0 && !queued) return !failed();
        const waiting =
          pending.length > 0
            ? pending.map(([, request]) => request)
            : [...requests.current.values()];
        if (waiting.length === 0) return false;
        await Promise.all(waiting);
      }
      return false;
    };
    return () => {
      target.current = null;
    };
  });

  useEffect(() => {
    for (const stage of failedStages.current) {
      if (options.saveStatuses?.[stage] === "saved") failedStages.current.delete(stage);
    }
    const fenceRev = componentsFenceRev.current;
    if (
      fenceRev !== null &&
      (latestOptions.current.expectedComponentsRevisionOf?.() ?? 0) >= fenceRev
    ) {
      componentsFenceRev.current = null;
    }
    flushQueuedArms();
  });

  useEffect(() => {
    armedClass.current = classId;
    const pending = timers.current;
    const arms = latestArm.current;
    const queued = queuedArm.current;
    const flying = inFlight.current;
    const applied = appliedRev.current;
    const appliedGen = appliedGeneration;
    const appliedComponents = appliedComponentsRev;
    const componentsFence = componentsFenceRev;
    const componentsFlying = componentsInFlight;
    const fenced = conflicted.current;
    const gen = generation;
    return () => {
      gen.current += 1;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      arms.clear();
      queued.clear();
      flying.clear();
      requests.current.clear();
      failedStages.current.clear();
      applied.clear();
      appliedGen.current = 0;
      appliedComponents.current = 0;
      componentsFence.current = null;
      componentsFlying.current = false;
      fenced.clear();
      armDraft.current.clear();
    };
  }, [classId, resetVersion]);
}
