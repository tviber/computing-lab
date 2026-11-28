import { createSignal, type Accessor } from "solid-js";

type Slice = {
  read: Accessor<unknown>;
  write: (value: unknown) => void;
};

function createSlice(initialValue: unknown): Slice {
  const [read, write] = createSignal<unknown>(initialValue);
  return { read, write: (value) => write(value) };
}

/**
 * Pure-reducer signal wrapper for lesson state machines that live in
 * `src/features/<lab>/lesson/state.ts`.
 *
 * Each top-level state field gets its own signal and a getter on a stable
 * state object. Readers therefore subscribe to the slices they read, while
 * nested lesson data (drafts, payload arrays, judge results) stays plain:
 * autosave can keep immutable draft snapshots and workers can structured-
 * clone those values without hitting Proxy objects.
 *
 * The reducer contract keeps the top-level key set stable. Lesson reducers
 * already do this by spreading the previous state; a shape change is a bug,
 * not a state transition.
 */
export function createReducer<S extends object, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
): [Accessor<S>, (action: A) => void] {
  let current = initialState;
  const state = Object.create(Object.getPrototypeOf(initialState)) as S;
  const keys = Reflect.ownKeys(initialState);
  const keySet = new Set(keys);
  const slices = new Map<PropertyKey, Slice>();

  for (const key of keys) {
    const slice = createSlice(Reflect.get(initialState, key));
    slices.set(key, slice);
    Object.defineProperty(state, key, {
      enumerable: Object.prototype.propertyIsEnumerable.call(initialState, key),
      configurable: false,
      get: slice.read,
    });
  }

  const dispatch = (action: A) => {
    const next = reducer(current, action);
    if (Object.is(next, current)) return;
    const nextKeys = Reflect.ownKeys(next);
    if (nextKeys.length !== keys.length || nextKeys.some((key) => !keySet.has(key))) {
      throw new Error("createReducer: reducers must preserve the top-level state keys");
    }
    const previous = current;
    current = next;
    for (const key of keys) {
      const value = Reflect.get(next, key);
      if (!Object.is(Reflect.get(previous, key), value)) {
        slices.get(key)?.write(value);
      }
    }
  };

  return [() => state, dispatch];
}
