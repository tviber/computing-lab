/**
 * Ownership helpers for short-lived Pyodide handles.
 *
 * `toPy()` results and `globals.get()` callables are independent PyProxy
 * references. Destroying the enclosing globals dict does not release them,
 * so every temporary handle must be destroyed on both success and failure.
 * Pyodide returns JS primitives unchanged for primitive values, so release
 * checks must not assume every value has a `destroy()` method.
 */

export type PyCallableHandle = {
  callKwargs: (...args: unknown[]) => unknown;
};

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

/** Release a PyProxy handle if the value has one; primitives pass through. */
export function destroyIfProxy(value: unknown): void {
  if (!isObjectLike(value)) return;
  const destroy = (value as { destroy?: unknown }).destroy;
  if (typeof destroy === "function") destroy.call(value);
}

/** Use `value` briefly, then release its PyProxy handle exactly once. */
export function withPyValue<T, R>(value: T, use: (value: T) => R): R {
  try {
    return use(value);
  } finally {
    destroyIfProxy(value);
  }
}

function isPyCallable(value: unknown): value is PyCallableHandle {
  return (
    isObjectLike(value) && typeof (value as { callKwargs?: unknown }).callKwargs === "function"
  );
}

/**
 * Look up a Python function in `globals`, verify its callable shape, then
 * release the JS-side handle. The Python function itself stays alive in
 * `globals`; only the temporary reference is destroyed.
 */
export function assertPyCallable(
  globals: { get: (name: string) => unknown },
  name: string,
  signature: string,
): void {
  const callable = globals.get(name);
  try {
    if (!isPyCallable(callable)) {
      throw new Error(`需要一个函数 ${signature}`);
    }
  } finally {
    destroyIfProxy(callable);
  }
}
