import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

type DraftSaveResponse = {
  ok?: boolean;
  applied?: boolean;
  revision?: number;
  projectGeneration?: number;
  /** Calculator only: the component library's own OCC counter after this
   *  write (see `expectedComponentsRevision` in the body). */
  componentsRevision?: number;
};

/**
 * Silent debounced autosave of the per-stage draft. Timers live in a ref keyed
 * by stage, so an armed payload always reaches the server: effect re-runs and
 * stage switches never cancel a pending timer — only a newer arm for the same
 * stage (debounce) or unmount does.
 *
 * Draft writes are optimistic concurrency on a server-assigned revision:
 * every PUT carries `expectedRevision` — the revision the client last saw
 * applied for that stage (0 when none). The server applies the write only
 * while that still equals its stored revision and answers with the assigned
 * (`applied: true`) or current stored (`applied: false`) revision, so a stale
 * write can never resurrect an older draft and client clocks play no role.
 * The draft snapshot is taken when the timer arms — the dirty flag marks
 * THAT draft — while `expectedRevision` is computed when a request sends, so
 * a save that applied between arm and send still raises it. Four guards make
 * that safe in a live editor:
 *
 * - One request per stage at a time: a timer that fires while its stage's
 *   earlier save is still in flight queues instead of sending; when the
 *   response lands, the newest queued arm sends with a freshly computed
 *   expectedRevision. Without it two of our own writes would race each other
 *   into a false conflict and clobber newer local edits.
 * - The draft snapshot is per arm, not read at send time: `draftOf` in the
 *   committed options returns the stage the page is showing NOW, which would
 *   send the wrong stage's draft once the learner has switched away.
 * - A resolving request reports its completion only while it is still the
 *   stage's latest arm, so an older in-flight save can never overwrite a
 *   newer dirty state — and a response from an earlier context (unmount or
 *   class switch, including A→B→A) is generation-checked and dropped before
 *   it can cancel the new context's timers or fire conflict handling.
 * - A rejected write (`applied: false`) means the server holds a newer
 *   write from elsewhere. The stage is then fenced: its queued arm and any
 *   still-debouncing timer die with it — letting one send would carry the
 *   reconciled revision on content that predates it and silently overwrite
 *   the winning write — `onConflict` fires so the caller can refetch and
 *   reconcile, and no new arm for that stage may leave until the lesson
 *   state has caught up to the revision the rejection reported (the re-arm
 *   gate below). A failed refetch leaves the fence up: the caller flags the
 *   stage as sync-error instead of resolved and only an explicit retry may
 *   lift it. Only then does a dirty flag schedule a write that legitimately
 *   supersedes the server draft.
 * - The component library is one project-wide resource, so its concurrency
 *   rules are project-wide too: only one component-carrying request may be
 *   in flight at a time (a second same-client send would race the first's
 *   revision into a false conflict), and a REFUSED component write fences
 *   every later component-carrying send — not only the refusing stage's —
 *   until the lesson state resyncs BOTH the library snapshot and its
 *   revision. A fenced send is PARKED, never dropped: its stage keeps a
 *   pending save task that re-sends once the resync lifts the fence, so a
 *   fenced stage can never end up with neither a save task nor a recovery
 *   path. The revision a refusal reports is a resync target, never an
 *   adopted counter: the client may only claim a new library revision
 *   after its own write applied or a full snapshot landed (the reconcile
 *   path delivers them together).
 *
 * The lifecycle callbacks all receive the stage they fired for; the lesson
 * reducer keeps flags per stage so one stage's late completion cannot
 * clobber the flag of the stage now on screen.
 */
export function useAutosaveDraft<TDraft>(options: {
  classId: string | undefined;
  labId: string;
  /** The lesson's save flag for `stageIndex` — the schedule only arms while "dirty". */
  saveStatus: string;
  stageIndex: number;
  /** Snapshots the draft that should persist for the given stage. */
  draftOf: (stageIndex: number) => TDraft | undefined;
  /** The revision the stage's last applied save reported (0 when none) —
   *  sent back to the server as `expectedRevision`. Read when a request
   *  sends, so it always reflects the freshest project state. */
  expectedRevisionOf: (stageIndex: number) => number;
  /** The component library's OCC counter (calculator only) — the library-
   *  wide counterpart of `expectedRevisionOf`. Required when `bodyFor` may
   *  include `components`: sent back as `expectedComponentsRevision` and
   *  likewise read when a request sends, so a queued arm always carries
   *  the freshest counter rather than the one from arm time. */
  expectedComponentsRevisionOf?: () => number;
  /** The library's local edit sequence (calculator only), read when a
   *  component-carrying request sends. Its value is echoed back through
   *  `onSaved`'s `componentsSeq`, so the caller confirms exactly the edits
   *  the request carried — edits made after the send stay unconfirmed and
   *  keep `components` attached to later saves. */
  componentsSeqOf?: () => number;
  /** PUT body; defaults to `{ stageIndex, draft }`. `expectedRevision` is merged in. */
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  /** Other stages whose save flag is also dirty — e.g. a calculator
   *  component rename rewrites drafts the learner is not looking at. Each
   *  gets the same debounced arm as the stage on screen (its snapshot is
   *  read through `draftOf`), so cross-stage edits persist without waiting
   *  for a stage switch. */
  dirtyStages?: number[];
  /** Send-time veto: return true to park this arm instead of sending —
   *  e.g. the draft references a component the server does not hold yet.
   *  The stage keeps its pending save task and its dirty flag; every later
   *  flush re-evaluates the veto. */
  holdSend?: (stageIndex: number, draft: TDraft) => boolean;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  /** Server project generation counter (incremented on reset) — sent on every
   *  PUT so a delayed pre-reset write can never match revision 0 after reset. */
  expectedGeneration?: number;
  /** Incrementing this token cancels pending saves and resets revision tracking (e.g. staff lab reset). */
  resetVersion?: number;
  onSaving: (stageIndex: number) => void;
  onSaved: (
    stageIndex: number,
    revision?: number,
    componentsRevision?: number,
    componentsSeq?: number,
  ) => void;
  onError: (stageIndex: number) => void;
  /** The server dropped the stage's latest write because a newer one exists
   *  elsewhere — the caller should refetch the project and reconcile the
   *  conflicted stage's draft. */
  onConflict?: (stageIndex: number) => void;
}): void {
  const { classId, labId, saveStatus, stageIndex, deps = [], resetVersion = 0 } = options;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const latestArm = useRef(new Map<number, number>());
  const queuedArm = useRef(new Map<number, number>());
  const inFlight = useRef(new Set<number>());
  const appliedRev = useRef(new Map<number, number>());
  const appliedGeneration = useRef(0);
  // The component library's counter mirrors appliedRev but is project-wide
  // (one counter shared by every stage's save). Only our own APPLIED write
  // may raise it — a refusal merely reports where the server's counter
  // stands, and claiming that counter without the matching snapshot is the
  // stale-list overwrite hole.
  const appliedComponentsRev = useRef(0);
  // Project-wide fence on the shared library: a refused component-carrying
  // write blocks EVERY later component-carrying send until the lesson
  // state resyncs both the library snapshot and its revision (the reported
  // counter is the resync target, not an adopted revision).
  const componentsFenceRev = useRef<number | null>(null);
  // Component writes serialize project-wide: a second component-carrying
  // send while one is in flight would race its revision into a false
  // conflict — it queues on the components slot instead.
  const componentsInFlight = useRef(false);
  // Stages the server fenced with a rejection: nothing for them may send
  // until the lesson state reconciles to the rejection's revision (gate in
  // the arm effect below).
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
  // Lifecycle identity of the current mount/class context. The class-switch
  // cleanup bumps it, so a response that arrives after a switch — including
  // A→B→A where armedClass alone would match again — or after unmount is
  // dropped before it can touch timers, queues, or callbacks.
  const generation = useRef(0);

  useEffect(() => {
    latestOptions.current = options;
  });

  // Per-arm draft snapshots: the draft a dirty flag marked belongs to the
  // stage armed at that moment — reading draftOf later would see whatever
  // stage is on screen when the timer fires, not the one that was edited.
  const armDraft = useRef(new Map<number, { stage: number; draft: TDraft }>());

  // Flush every parked arm whose stage has no send in flight. That covers
  // the classic same-stage queue AND arms the components gate parked on
  // other stages; a flushed send re-runs sendNow, so a still-occupied
  // components slot simply re-parks it.
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
    // The caller may veto a send while the draft references state the
    // server does not hold yet (a calculator draft naming a component that
    // now lives only in the conflict backup). The arm parks exactly like a
    // fenced one: the stage keeps its pending save task and its dirty
    // flag, and a later flush re-evaluates the veto — the learner's
    // explicit restore (or fixing the reference) is what lets it through.
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
    // The library edit seq this send carried — echoed to onSaved so the
    // caller confirms only the edits the request contained, never the ones
    // made after it left.
    let sentComponentsSeq: number | undefined;
    // The library's expected counter joins the body only when the save
    // actually carries components — and, like expectedRevision, it is
    // computed here rather than in bodyFor so an arm that queued behind an
    // in-flight save claims the revision that save just reported.
    if (carriesComponents && opts.expectedComponentsRevisionOf) {
      body.expectedComponentsRevision = Math.max(
        appliedComponentsRev.current,
        opts.expectedComponentsRevisionOf(),
      );
      sentComponentsSeq = opts.componentsSeqOf?.();
      // The library is shared across stages, so its fences are too. While
      // the refusal's reconcile is still delivering the server snapshot,
      // this arm's library predates the resync — sending it under the
      // reported revision is the stale-list overwrite hole in another tab's
      // favor. Park it instead: the arm keeps its draft snapshot and its
      // place in the stage's arm queue, so the stage still has a pending
      // save task — the flush effect re-sends it once the lesson state has
      // resynced to the fence's revision (the refusal's onConflict already
      // started that reconcile). Deleting it would strand the stage's draft
      // with no save task and no recovery path.
      const fenceRev = componentsFenceRev.current;
      if (fenceRev !== null && opts.expectedComponentsRevisionOf() < fenceRev) {
        const prev = queuedArm.current.get(stage);
        if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
        queuedArm.current.set(stage, arm);
        return;
      }
      // One component write in flight at a time project-wide: a second
      // would race the first's revision into a false conflict.
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
    void api
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
          if (componentsRev !== undefined) {
            // A refused component write fences the whole project, not only
            // this stage, until the library resyncs to the reported counter.
            componentsFenceRev.current = Math.max(componentsFenceRev.current ?? 0, componentsRev);
          }
          conflicted.current.add(stage);
          const pendingTimer = timers.current.get(stage);
          if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            timers.current.delete(stage);
          }
          // The stage's pending debounce arm (its latest) can never fire
          // now — drop its snapshot. The responding arm's own was already
          // dropped above; a queued arm's goes with its entry below.
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
        // A newer arm waited for this response — send it and let ITS result
        // report; this arm was superseded whether it applied or not.
        flushQueuedArms();
        if (latestArm.current.get(stage) !== arm) return;
        opts.onSaved(stage, rev, componentsRev, sentComponentsSeq);
      })
      .catch(() => {
        if (generation.current !== gen) return;
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        if (carriesComponents) componentsInFlight.current = false;
        flushQueuedArms();
        if (latestArm.current.get(stage) === arm) opts.onError(stage);
      });
  };

  useEffect(() => {
    if (armedClass.current !== classId || !classId) return;
    // Every stage whose flag reports dirty gets its own debounced arm: the
    // stage on screen plus any extras the page lists — a cross-stage edit
    // like a component rename rewrites drafts the learner is not looking
    // at, and their updated references must reach the server too, not only
    // when the learner happens to revisit the stage.
    const stages = [
      ...(saveStatus === "dirty" ? [stageIndex] : []),
      ...(latestOptions.current.dirtyStages ?? []).filter((s) => s !== stageIndex),
    ];
    for (const stage of stages) {
      // A fenced stage stays silent until the lesson state has reconciled
      // to the revision the rejection reported — `expectedRevisionOf` reads
      // the reducer's reconciled revisions. Drafts edited before that
      // point may never arm: their content predates the server write they
      // would claim to succeed. Once the gate passes (reconcile landed, or
      // the learner explicitly restored their copy) the stage autosaves
      // normally.
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
      // A pending arm already holding THIS draft needs no refresh — parked
      // on a fence or a holdSend veto, still debouncing, or mid-send, it
      // persists exactly this content. Only a newer snapshot re-arms so the
      // latest content is what ships.
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
        // The cancelled arm's snapshot can never send — a pending-timer arm
        // is by definition neither in-flight nor queued, so nothing else
        // would ever drop it.
        if (pendingArm !== undefined) armDraft.current.delete(pendingArm);
      }
      // A parked arm is superseded the same way: this fresh arm is now the
      // stage's pending save task and carries the newer content — the stale
      // snapshot can never legitimately send.
      const supersededQueued = queuedArm.current.get(stage);
      if (supersededQueued !== undefined) {
        queuedArm.current.delete(stage);
        armDraft.current.delete(supersededQueued);
      }
      const timer = setTimeout(() => {
        timers.current.delete(stage);
        // The stage's earlier save is still in flight: queue this arm and
        // let the response flush it — same-session writes must never race
        // each other into a conflict.
        if (inFlight.current.has(stage)) {
          // Replacing an earlier queued arm: its snapshot can never send
          // now — drop it the same way a cancelled debounce arm's is
          // dropped (never itself: a re-parked arm is already queued).
          const prev = queuedArm.current.get(stage);
          if (prev !== undefined && prev !== arm) armDraft.current.delete(prev);
          queuedArm.current.set(stage, arm);
          return;
        }
        sendNow(stage, arm, classId);
      }, AUTOSAVE_DELAY_MS);
      timers.current.set(stage, timer);
    }
    // Deliberately no cleanup: the callbacks and draftOf are inline closures
    // (new identity every render), so they stay out of the dep list and the
    // timer only re-arms on the stable inputs below — never on every render,
    // and never just because saveStatus flipped.
  }, [saveStatus, stageIndex, classId, labId, ...deps]);

  // Lift the project-wide components fence once the lesson state has
  // resynced to the revision the refusal reported (a reconcile, a judge
  // adoption, or a project reload all raise the reducer's counter). Parked
  // arms then re-send through sendNow — and the flush itself runs after
  // EVERY render, not only on a fence clear: a held send's veto can lift on
  // reducer changes the hook cannot see (the learner restoring the conflict
  // backup or fixing the dangling reference), while arms still blocked by a
  // fence or an occupied components slot simply re-park.
  useEffect(() => {
    const fenceRev = componentsFenceRev.current;
    if (
      fenceRev !== null &&
      (latestOptions.current.expectedComponentsRevisionOf?.() ?? 0) >= fenceRev
    ) {
      componentsFenceRev.current = null;
    }
    flushQueuedArms();
  });

  // Unmount or class switch: nothing armed for this context should still fire,
  // and nothing already in flight may report back into the new context — the
  // generation bump turns every earlier context's late response into a silent
  // drop even when the classId matches again (A→B→A).
  // This effect is declared after the arm effect so its create runs last on a
  // class-switch commit: only then does the new classId become armable.
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
      // Every request sent in this context is dead: its completion must not
      // report, fire conflicts, or cancel a newer context's timers.
      gen.current += 1;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      arms.clear();
      queued.clear();
      flying.clear();
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
