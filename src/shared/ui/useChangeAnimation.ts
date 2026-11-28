import { createEffect, createSignal } from "solid-js";

/** Highlight a changed value in place. An undefined value resets the feedback baseline. */
export function useChangeAnimation<T extends Element>(
  value: () => unknown,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions = { duration: 280, easing: "ease-out" },
) {
  const [element, setElement] = createSignal<T | null>(null);
  let previousElement: T | null = null;
  let initialized = false;
  let previous: unknown;

  createEffect(
    () => ({ element: element(), value: value() }),
    ({ element, value }) => {
      if (element !== previousElement) {
        initialized = false;
        previousElement = element;
      }
      if (!element?.isConnected || value === undefined) {
        initialized = false;
        return;
      }
      const changed = initialized && !Object.is(previous, value);
      previous = value;
      initialized = true;
      const preference = window.matchMedia?.("(prefers-reduced-motion: no-preference)");
      if (!changed || !preference?.matches || document.hidden || !element.animate) return;

      const animation = element.animate(keyframes, options);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        preference.removeEventListener("change", cancel);
        document.removeEventListener("visibilitychange", onVisibility);
        animation.removeEventListener("finish", cleanup);
        animation.removeEventListener("cancel", cleanup);
      };
      const cancel = () => {
        if (animation.playState !== "finished" && animation.playState !== "idle") {
          animation.cancel();
        }
        cleanup();
      };
      const onVisibility = () => {
        if (document.hidden) cancel();
      };
      preference.addEventListener("change", cancel);
      document.addEventListener("visibilitychange", onVisibility);
      animation.addEventListener("finish", cleanup);
      animation.addEventListener("cancel", cleanup);
      return cancel;
    },
  );

  return (element: T) => setElement(() => element);
}
