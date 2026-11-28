export type LatestRequestResult<T> =
  { status: "applied"; value: T } | { status: "stale" } | { status: "error"; error: unknown };

/**
 * Accepts only the newest request. Starting a request invalidates every older
 * one; cancel() invalidates the current request when a panel closes.
 */
export function createLatestRequest() {
  let generation = 0;

  return {
    run<T>(load: () => Promise<T>): Promise<LatestRequestResult<T>> {
      const requestId = ++generation;
      let pending: Promise<T>;
      try {
        pending = load();
      } catch (error) {
        generation += 1;
        return Promise.resolve({ status: "error", error });
      }
      return pending.then(
        (value) =>
          requestId === generation
            ? { status: "applied" as const, value }
            : { status: "stale" as const },
        (error) =>
          requestId === generation
            ? { status: "error" as const, error }
            : { status: "stale" as const },
      );
    },
    cancel() {
      generation += 1;
    },
  };
}
