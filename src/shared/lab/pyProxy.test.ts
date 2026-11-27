import { describe, expect, it, vi, type Mock } from "vitest";
import { assertPyCallable, destroyIfProxy, withPyValue, type PyCallableHandle } from "./pyProxy.ts";

function fakeHandle(): { destroy: Mock<() => void> } {
  return { destroy: vi.fn() };
}

function fakeCallable(): PyCallableHandle & { destroy: Mock<() => void> } {
  return {
    destroy: vi.fn(),
    callKwargs: vi.fn(),
  };
}

describe("withPyValue", () => {
  it("destroys the handle once after a successful use", () => {
    const value = fakeHandle();
    expect(withPyValue(value, (handle) => handle === value)).toBe(true);
    expect(value.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the handle once when use throws", () => {
    const value = fakeHandle();
    expect(() =>
      withPyValue(value, () => {
        throw new Error("student code failed");
      }),
    ).toThrow("student code failed");
    expect(value.destroy).toHaveBeenCalledOnce();
  });

  it.each([42, "decode", false, null, undefined])(
    "passes primitive %s through without attempting destroy",
    (value) => {
      expect(withPyValue(value, (input) => input)).toBe(value);
    },
  );
});

describe("destroyIfProxy", () => {
  it("destroys an object with a destroy method", () => {
    const value = fakeHandle();
    destroyIfProxy(value);
    expect(value.destroy).toHaveBeenCalledOnce();
  });

  it.each([42, "decode", false, null, undefined, {}])(
    "ignores %s when there is no destroy method",
    (value) => {
      expect(() => destroyIfProxy(value)).not.toThrow();
    },
  );
});

describe("assertPyCallable", () => {
  it("destroys a valid callable once after checking it", () => {
    const callable = fakeCallable();
    const globals = { get: () => callable };
    expect(() => assertPyCallable(globals, "decode", "decode(data)")).not.toThrow();
    expect(callable.destroy).toHaveBeenCalledOnce();
  });

  it("rejects a missing function without creating a handle", () => {
    const globals = { get: () => undefined };
    expect(() => assertPyCallable(globals, "decode", "decode(data)")).toThrow(
      "需要一个函数 decode(data)",
    );
  });

  it("destroys a non-callable handle once before rejecting it", () => {
    const value = fakeHandle();
    const globals = { get: () => value };
    expect(() => assertPyCallable(globals, "decode", "decode(data)")).toThrow(
      "需要一个函数 decode(data)",
    );
    expect(value.destroy).toHaveBeenCalledOnce();
  });

  it.each([42, "abc", false, null])(
    "rejects primitive %s with the friendly function error",
    (value) => {
      const globals = { get: () => value };
      expect(() => assertPyCallable(globals, "decode", "decode(data)")).toThrow(
        "需要一个函数 decode(data)",
      );
    },
  );
});
