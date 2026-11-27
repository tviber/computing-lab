import { createEffect, createSignal } from "solid-js";

export function useScrollEdges<T extends HTMLElement>() {
  const [element, setElement] = createSignal<T | null>(null);
  const ref = (node: T) => {
    setElement(() => node);
  };
  createEffect(
    () => element(),
    (el) => {
      if (!el) return;
      const update = () => {
        el.toggleAttribute("data-more-above", el.scrollTop > 1);
        el.toggleAttribute("data-more-below", el.scrollHeight - el.clientHeight - el.scrollTop > 1);
        el.toggleAttribute("data-more-right", el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
      };
      update();
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
      observer?.observe(el);
      if (el.firstElementChild) observer?.observe(el.firstElementChild);
      el.addEventListener("scroll", update, { passive: true });
      return () => {
        observer?.disconnect();
        el.removeEventListener("scroll", update);
      };
    },
  );
  return ref;
}
