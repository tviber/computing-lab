/**
 * Ownership helpers for short-lived Pyodide handles.
 *
 * `toPy()` results and `globals.get()` callables are independent PyProxy
 * references. Destroying the enclosing globals dict does not release them,
 * so every temporary handle must be destroyed on both success and failure.
 */

export type PyHandle = {
  destroy: () => void;
};

export type PyCallableHandle = PyHandle & {
  callKwargs: (...args: unknown[]) => unknown;
};

/** Use `value` briefly, then release its PyProxy handle exactly once. */
export function withPyValue<T extends PyHandle, R>(value: T, use: (value: T) => R): R {
  try {
    return use(value);
  } finally {
    value.destroy();
  }
}

/**
 * Look up a Python function in `globals`, verify its callable shape, then
 * destroy the handle after `use` finishes. The Python function itself stays
 * alive in `globals`; only the JS-side reference is released.
 */
export function withPyCallable<T extends PyHandle, R>(
  globals: { get: (name: string) => T | undefined },
  name: string,
  signature: string,
  use: (callable: T & PyCallableHandle) => R,
): R {
  const callable = globals.get(name);
  if (callable === undefined) {
    throw new Error(`需要一个函数 ${signature}`);
  }
  if (typeof (callable as Partial<PyCallableHandle>).callKwargs !== "function") {
    callable.destroy();
    throw new Error(`需要一个函数 ${signature}`);
  }
  try {
    return use(callable as T & PyCallableHandle);
  } finally {
    callable.destroy();
  }
}
