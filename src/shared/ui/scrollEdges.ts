import { useCallback, useEffect, useState } from "react";

export function useScrollEdges<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return;
    const update = () => {
      element.toggleAttribute("data-more-above", element.scrollTop > 1);
      element.toggleAttribute(
        "data-more-below",
        element.scrollHeight - element.clientHeight - element.scrollTop > 1,
      );
      element.toggleAttribute(
        "data-more-right",
        element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
      );
    };
    update();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [element]);
  return ref;
}
