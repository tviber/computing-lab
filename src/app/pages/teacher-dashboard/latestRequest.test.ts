import { describe, expect, it } from "vitest";
import { createLatestRequest } from "./latestRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createLatestRequest", () => {
  it("ignores an older response that resolves after the newest one", async () => {
    const latest = createLatestRequest();
    const first = deferred<string>();
    const second = deferred<string>();
    const firstResult = latest.run(() => first.promise);
    const secondResult = latest.run(() => second.promise);

    second.resolve("new");
    await expect(secondResult).resolves.toEqual({ status: "applied", value: "new" });
    first.resolve("old");
    await expect(firstResult).resolves.toEqual({ status: "stale" });
  });

  it("reports a current error and turns the old error stale", async () => {
    const latest = createLatestRequest();
    const first = deferred<string>();
    const second = deferred<string>();
    const firstResult = latest.run(() => first.promise);
    const secondResult = latest.run(() => second.promise);
    const failure = new Error("late");

    first.reject(failure);
    await expect(firstResult).resolves.toEqual({ status: "stale" });
    second.reject(failure);
    await expect(secondResult).resolves.toEqual({ status: "error", error: failure });
  });

  it("invalidates the pending request when cancelled", async () => {
    const latest = createLatestRequest();
    const pending = deferred<string>();
    const result = latest.run(() => pending.promise);
    latest.cancel();
    pending.resolve("closed");
    await expect(result).resolves.toEqual({ status: "stale" });
  });
});
