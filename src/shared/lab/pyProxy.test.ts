import { describe, expect, it, vi, type Mock } from "vitest";
import { withPyCallable, withPyValue, type PyCallableHandle, type PyHandle } from "./pyProxy.ts";

function fakeHandle(): PyHandle & { destroy: Mock<() => void> } {
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
});

describe("withPyCallable", () => {
  it("passes the callable through and destroys it once after use", () => {
    const callable = fakeCallable();
    const globals = { get: () => callable };
    expect(withPyCallable(globals, "decode", "decode(data)", (fn) => fn === callable)).toBe(true);
    expect(callable.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the callable once when use throws", () => {
    const callable = fakeCallable();
    const globals = { get: () => callable };
    expect(() =>
      withPyCallable(globals, "decode", "decode(data)", () => {
        throw new Error("student code failed");
      }),
    ).toThrow("student code failed");
    expect(callable.destroy).toHaveBeenCalledOnce();
  });

  it("rejects a missing function without creating a handle", () => {
    const globals = { get: () => undefined };
    expect(() => withPyCallable(globals, "decode", "decode(data)", () => undefined)).toThrow(
      "需要一个函数 decode(data)",
    );
  });

  it("destroys a non-callable handle once before rejecting it", () => {
    const value = fakeHandle();
    const globals = { get: () => value };
    expect(() => withPyCallable(globals, "decode", "decode(data)", () => undefined)).toThrow(
      "需要一个函数 decode(data)",
    );
    expect(value.destroy).toHaveBeenCalledOnce();
  });
});
