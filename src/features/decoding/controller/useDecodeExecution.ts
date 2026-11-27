/**
 * One async-execution channel of the decoding lab. Every run is stamped
 * with the (stageIndex, inputRevision) it started under — its input
 * version. A result or error commits only while that stamp is still
 * current, so:
 *
 * - an out-of-order Pyodide completion from a previous stage can never
 *   land on the stage now on screen, nor clear its running flag;
 * - a run that finishes after the student edited the draft no longer
 *   describes the current code — it is dropped, and submit stays gated on
 *   a result that still matches the input it ran under.
 */

import { createMemo, createSignal, untrack } from "solid-js";

/** An execution outcome stamped with the input it ran under. */
export type ExecutionResult<T> = {
  inputRevision: number;
  stageIndex: number;
  result: T;
};

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export type DecodeExecutionOptions = {
  stageIndex: number;
  /** Version of the run input (e.g. the draft's code/fills counter). */
  inputRevision: number;
  /** Maps a thrown error to the student-facing message; defaults to message text. */
  describeError?: (error: unknown) => string;
};

export function useDecodeExecution<T>(getOptions: () => DecodeExecutionOptions): {
  /** True while this channel's latest run is still in flight. */
  readonly running: boolean;
  /** Latest successful result that still matches the current stage+input. */
  readonly result: T | null;
  /** Latest error that still matches the current stage+input. */
  readonly error: string | null;
  /** Run a task on this channel; its outcome is stamped and can go stale. */
  execute: (task: () => Promise<T>) => Promise<void>;
  /** Record an input-validation error on this channel (same staleness rules). */
  fail: (message: string) => void;
  /** Drop the stored outcome (e.g. leaving the stage). */
  clear: () => void;
} {
  const [envelope, setEnvelope] = createSignal<ExecutionResult<Outcome<T>> | null>(null);
  const [running, setRunning] = createSignal(false);
  // Each execute gets a ticket: only the latest run may publish or settle
  // the running flag — an older promise resolving later finds a stale ticket.
  let ticketSeq = 0;

  const fail = (message: string) => {
    const opts = untrack(getOptions);
    setEnvelope({
      stageIndex: opts.stageIndex,
      inputRevision: opts.inputRevision,
      result: { ok: false, error: message },
    });
  };

  const execute = async (task: () => Promise<T>) => {
    const opts = untrack(getOptions);
    const ticket = ++ticketSeq;
    const tag = { stageIndex: opts.stageIndex, inputRevision: opts.inputRevision };
    const settle = (result: Outcome<T>) => {
      const cur = untrack(getOptions);
      // A newer run owns the channel, or the input moved on mid-flight.
      if (ticketSeq !== ticket) return;
      if (cur.stageIndex !== tag.stageIndex || cur.inputRevision !== tag.inputRevision) return;
      setEnvelope({ ...tag, result });
    };
    setRunning(true);
    setEnvelope(null);
    try {
      settle({ ok: true, value: await task() });
    } catch (error) {
      const describe = untrack(getOptions).describeError;
      settle({
        ok: false,
        error: describe?.(error) ?? (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      if (ticketSeq === ticket) setRunning(false);
    }
  };

  const clear = () => {
    // Retire any in-flight run: its late settle/finally may no longer write
    // here, and the running flag belongs to whatever is on screen now.
    ticketSeq += 1;
    setEnvelope(null);
    setRunning(false);
  };

  // Read-time guard: an envelope stored before an edit no longer matches.
  const valid = createMemo(() => {
    const env = envelope();
    const opts = getOptions();
    return env && env.stageIndex === opts.stageIndex && env.inputRevision === opts.inputRevision
      ? env
      : null;
  });

  return {
    get running() {
      return running();
    },
    get result() {
      const v = valid();
      return v && v.result.ok ? v.result.value : null;
    },
    get error() {
      const v = valid();
      return v && !v.result.ok ? v.result.error : null;
    },
    execute,
    fail,
    clear,
  };
}
