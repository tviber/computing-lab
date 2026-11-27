import "@testing-library/jest-dom/vitest";
import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

// jsdom has no animation timeline or scrollIntoView/Range rect geometry.
if (typeof Element !== "undefined") {
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

// Node ≥23 ships a global localStorage that lacks .clear() unless
// --localstorage-file is set; jsdom tests need a working Web Storage.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const shim = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
}

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}

// jsdom applies UA `[popover]:not(:popover-open) { display: none }` but does
// not implement the Popover API (`showPopover`/`hidePopover` or `:popover-open`).
if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function () {
    this.style.display = this.style.display || "block";
  };
  HTMLElement.prototype.hidePopover = function () {
    this.style.display = "none";
  };
}

afterEach(() => {
  cleanup();
});
