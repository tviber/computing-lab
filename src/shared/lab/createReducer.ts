import { createSignal, type Accessor } from "solid-js";

/**
 * Pure-reducer signal wrapper for lesson state machines that live in
 * `src/features/<lab>/lesson/state.ts`.
 */
export function createReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
): [Accessor<S>, (action: A) => void] {
  const [box, setBox] = createSignal(
    { current: initialState },
    { equals: (a, b) => Object.is(a.current, b.current) },
  );
  const state: Accessor<S> = () => box().current;
  const dispatch = (action: A) => {
    setBox((prev) => {
      const next = reducer(prev.current, action);
      return Object.is(next, prev.current) ? prev : { current: next };
    });
  };
  return [state, dispatch];
}
