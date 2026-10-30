import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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

afterEach(() => {
  cleanup();
});
