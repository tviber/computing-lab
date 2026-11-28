import { createEffect, createSignal } from "solid-js";

/** Highlight a changed value without remounting its controls or delaying its result. */
export function useChangeAnimation<T extends Element>(
  value: () => unknown,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions = { duration: 280, easing: "ease-out" },
) {
  const [element, setElement] = createSignal<T | null>(null);
  let initialized = false;
  let previous: unknown;

  createEffect(
    () => ({ element: element(), value: value() }),
    ({ element, value }) => {
      if (!element) return;
      const changed = initialized && !Object.is(previous, value);
      previous = value;
      initialized = true;
      const preference = window.matchMedia?.("(prefers-reduced-motion: no-preference)");
      if (!changed || !preference?.matches || document.hidden || !element.animate) return;

      const animation = element.animate(keyframes, options);
      const cancel = () => animation.cancel();
      const onVisibility = () => {
        if (document.hidden) cancel();
      };
      preference.addEventListener("change", cancel);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        cancel();
        preference.removeEventListener("change", cancel);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
  );

  return (element: T) => setElement(() => element);
}
