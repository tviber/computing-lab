import { useLabRuntime } from "./runtime";
import { createEffect, createMemo, untrack } from "solid-js";

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

export type AutosaveDraftOptions<TDraft> = {
  scopeId: string | undefined;
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
};

export function useAutosaveDraft<TDraft>(getOptions: () => AutosaveDraftOptions<TDraft>): void {
  const { transport } = useLabRuntime();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const latestArm = new Map<number, number>();
  const queuedArm = new Map<number, number>();
  const inFlight = new Set<number>();
  const requests = new Map<number, Promise<void>>();
  const failedStages = new Set<number>();
  const appliedRev = new Map<number, number>();
  let appliedGeneration = 0;
  let appliedComponentsRev = 0;
  // Project-wide fence on the shared library: a refused component-carrying
  // write blocks EVERY later component-carrying send until the lesson
  // state resyncs both the library snapshot and its revision (the reported
  // counter is the resync target, not an adopted revision).
  let componentsFenceRev: number | null = null;
  let componentsInFlight = false;
  const conflicted = new Set<number>();
  let armSeq = 0;
  // Which scopeId the lesson state on screen belongs to. On a class switch
  // the first update still carries the previous class's save flags — arming
  // then would PUT a stale snapshot under the new class. The lifecycle effect
  // below re-points this variable right after the arm effect runs, so only
  // dirty flags raised under the new state arm saves.
  let armedClass = untrack(() => getOptions().scopeId);
  let generation = 0;
  const armDraft = new Map<number, { stage: number; draft: TDraft }>();

  const latestOptions = () => untrack(getOptions);

  const flushQueuedArms = () => {
    for (const [queuedStage, queued] of [...queuedArm]) {
      if (inFlight.has(queuedStage)) continue;
      const armClass = armedClass;
      if (armClass === undefined) continue;
      queuedArm.delete(queuedStage);
      sendNow(queuedStage, queued, armClass);
    }
  };

  const sendNow = (stage: number, arm: number, armClass: string) => {
    const opts = latestOptions();
    const entry = armDraft.get(arm);
    if (!entry || entry.stage !== stage) return;
    const draft = entry.draft;
    if (opts.holdSend?.(stage, draft)) {
      const prev = queuedArm.get(stage);
      if (prev !== undefined && prev !== arm) armDraft.delete(prev);
      queuedArm.set(stage, arm);
      return;
    }
    const expectedRevision = Math.max(appliedRev.get(stage) ?? 0, opts.expectedRevisionOf(stage));
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
        appliedComponentsRev,
        opts.expectedComponentsRevisionOf(),
      );
      sentComponentsSeq = opts.componentsSeqOf?.();
      if (componentsFenceRev !== null && opts.expectedComponentsRevisionOf() < componentsFenceRev) {
        const prev = queuedArm.get(stage);
        if (prev !== undefined && prev !== arm) armDraft.delete(prev);
        queuedArm.set(stage, arm);
        return;
      }
      if (componentsInFlight) {
        const prev = queuedArm.get(stage);
        if (prev !== undefined && prev !== arm) armDraft.delete(prev);
        queuedArm.set(stage, arm);
        return;
      }
      componentsInFlight = true;
    }
    const gen = generation;
    inFlight.add(stage);
    opts.onSaving(stage);
    const request = transport
      .save<DraftSaveResponse>(armClass, opts.labId, body)
      .then((result) => {
        if (generation !== gen) return;
        inFlight.delete(stage);
        armDraft.delete(arm);
        if (carriesComponents) componentsInFlight = false;
        const rev = typeof result?.revision === "number" ? result.revision : undefined;
        if (rev !== undefined) {
          appliedRev.set(stage, Math.max(appliedRev.get(stage) ?? 0, rev));
        }
        const genNum =
          typeof result?.projectGeneration === "number" ? result.projectGeneration : undefined;
        if (genNum !== undefined) {
          appliedGeneration = Math.max(appliedGeneration, genNum);
        }
        const componentsRev =
          typeof result?.componentsRevision === "number" ? result.componentsRevision : undefined;
        // Only our own APPLIED write raises the counter we claim: a refusal
        // merely reports where the server stands, and adopting that number
        // without the matching snapshot is the stale-list overwrite hole —
        // the fence below holds every component send until the reconcile
        // lands both the library and its revision.
        if (componentsRev !== undefined && result?.applied !== false) {
          appliedComponentsRev = Math.max(appliedComponentsRev, componentsRev);
        }
        if (result?.applied === false) {
          failedStages.add(stage);
          if (componentsRev !== undefined) {
            componentsFenceRev = Math.max(componentsFenceRev ?? 0, componentsRev);
          }
          conflicted.add(stage);
          const pendingTimer = timers.get(stage);
          if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            timers.delete(stage);
          }
          const pendingArm = latestArm.get(stage);
          if (pendingArm !== undefined) armDraft.delete(pendingArm);
          latestArm.delete(stage);
          const queued = queuedArm.get(stage);
          if (queued !== undefined) {
            queuedArm.delete(stage);
            armDraft.delete(queued);
          }
          flushQueuedArms();
          latestOptions().onConflict?.(stage);
          return;
        }
        failedStages.delete(stage);
        flushQueuedArms();
        if (latestArm.get(stage) !== arm) return;
        latestOptions().onSaved(stage, rev, componentsRev, sentComponentsSeq);
      })
      .catch(() => {
        if (generation !== gen) return;
        failedStages.add(stage);
        inFlight.delete(stage);
        armDraft.delete(arm);
        if (carriesComponents) componentsInFlight = false;
        flushQueuedArms();
        if (latestArm.get(stage) === arm) latestOptions().onError(stage);
      })
      .finally(() => {
        if (requests.get(stage) === request) requests.delete(stage);
      });
    requests.set(stage, request);
  };

  // Effect 1: Arm timers when dirty flags or deps change, and reconcile fences/queues.
  createEffect(
    () => {
      const opts = getOptions();
      // Read deps and status collections so Solid tracks changes cleanly.
      const depsSnapshot = opts.deps ? [...opts.deps] : [];
      const saveStatusesSnapshot = opts.saveStatuses ? { ...opts.saveStatuses } : undefined;
      const dirtyStagesSnapshot = opts.dirtyStages ? [...opts.dirtyStages] : undefined;
      const componentsRev = opts.expectedComponentsRevisionOf?.();
      return {
        scopeId: opts.scopeId,
        labId: opts.labId,
        saveStatus: opts.saveStatus,
        stageIndex: opts.stageIndex,
        expectedGeneration: opts.expectedGeneration,
        saveStatuses: saveStatusesSnapshot,
        dirtyStages: dirtyStagesSnapshot,
        deps: depsSnapshot,
        componentsRev,
      };
    },
    (snap) => {
      const opts = latestOptions();
      for (const stage of failedStages) {
        if (snap.saveStatuses?.[stage] === "saved") failedStages.delete(stage);
      }
      if (componentsFenceRev !== null && (snap.componentsRev ?? 0) >= componentsFenceRev) {
        componentsFenceRev = null;
      }
      flushQueuedArms();

      if (armedClass !== snap.scopeId || !snap.scopeId) return;
      const backgroundDirty = snap.saveStatuses
        ? Object.keys(snap.saveStatuses)
            .map(Number)
            .filter((stage) => snap.saveStatuses?.[stage] === "dirty")
        : (snap.dirtyStages ?? []);
      const stages = [
        ...(snap.saveStatus === "dirty" ? [snap.stageIndex] : []),
        ...backgroundDirty.filter((s) => s !== snap.stageIndex),
      ];
      for (const stage of stages) {
        if (conflicted.has(stage)) {
          const revFenced =
            untrack(() => opts.expectedRevisionOf(stage)) < (appliedRev.get(stage) ?? 0);
          const genFenced = (opts.expectedGeneration ?? 0) < appliedGeneration;
          if (revFenced || genFenced) continue;
          conflicted.delete(stage);
        }
        const draft = untrack(() => opts.draftOf(stage));
        if (draft === undefined) continue;
        const pendingArm = latestArm.get(stage);
        const pendingTimer = timers.get(stage);
        if (pendingArm !== undefined && armDraft.get(pendingArm)?.draft === draft) {
          continue;
        }
        const arm = ++armSeq;
        latestArm.set(stage, arm);
        armDraft.set(arm, { stage, draft });
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          if (pendingArm !== undefined) armDraft.delete(pendingArm);
        }
        const supersededQueued = queuedArm.get(stage);
        if (supersededQueued !== undefined) {
          queuedArm.delete(stage);
          armDraft.delete(supersededQueued);
        }
        const scopeIdAtArm = snap.scopeId;
        const timer = setTimeout(() => {
          timers.delete(stage);
          if (inFlight.has(stage)) {
            const prev = queuedArm.get(stage);
            if (prev !== undefined && prev !== arm) armDraft.delete(prev);
            queuedArm.set(stage, arm);
            return;
          }
          sendNow(stage, arm, scopeIdAtArm);
        }, AUTOSAVE_DELAY_MS);
        timers.set(stage, timer);
      }
    },
  );

  // Effect 2: Expose flushPreservedDrafts handler on the caller's ref box.
  const flushTarget = createMemo(() => getOptions().flushPreservedDrafts);
  createEffect(flushTarget, (target) => {
    if (!target) return;
    target.current = async (preservesStage) => {
      const startGeneration = generation;
      const armClass = armedClass;
      if (armClass === undefined) return false;
      const failed = () => [...failedStages].some(preservesStage);
      const unsynced = Object.entries(latestOptions().saveStatuses ?? {}).some(
        ([stage, status]) =>
          preservesStage(Number(stage)) &&
          ["error", "conflict", "sync-error"].includes(status ?? ""),
      );
      if (unsynced) return false;

      while (generation === startGeneration) {
        for (const [stage, timer] of timers) {
          if (!preservesStage(stage)) continue;
          const arm = latestArm.get(stage);
          if (arm === undefined) continue;
          clearTimeout(timer);
          timers.delete(stage);
          queuedArm.set(stage, arm);
        }
        flushQueuedArms();
        const pending = [...requests].filter(([stage]) => preservesStage(stage));
        const queued = [...queuedArm.keys()].some(preservesStage);
        if (pending.length === 0 && !queued) return !failed();
        const waiting =
          pending.length > 0 ? pending.map(([, request]) => request) : [...requests.values()];
        if (waiting.length === 0) return false;
        await Promise.all(waiting);
      }
      return false;
    };
    return () => {
      target.current = null;
    };
  });

  // Effect 3: Class / reset lifecycle — runs AFTER Effect 1 so stale dirty
  // flags surviving a class switch never arm against the new scopeId.
  const lifecycleKey = createMemo(() => {
    const opts = getOptions();
    return `${opts.scopeId ?? "\0"}\0${opts.resetVersion ?? 0}`;
  });
  createEffect(lifecycleKey, () => {
    armedClass = latestOptions().scopeId;
    return () => {
      generation += 1;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      latestArm.clear();
      queuedArm.clear();
      inFlight.clear();
      requests.clear();
      failedStages.clear();
      appliedRev.clear();
      appliedGeneration = 0;
      appliedComponentsRev = 0;
      componentsFenceRev = null;
      componentsInFlight = false;
      conflicted.clear();
      armDraft.clear();
    };
  });
}
