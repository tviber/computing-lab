import { describe, expect, it } from "vitest";
import { resolveRuntimeBasePath } from "./basePath";

function visit(path: string) {
  window.history.replaceState({}, "", path);
}

describe("runtime base path", () => {
  it("keeps the configured prefix only when the browser is under it", () => {
    visit("/computing-lab/labs/calculator");
    expect(resolveRuntimeBasePath("/computing-lab")).toBe("/computing-lab");
    visit("/computing-lab");
    expect(resolveRuntimeBasePath("/computing-lab")).toBe("/computing-lab");
    visit("/labs/calculator");
    expect(resolveRuntimeBasePath("/computing-lab")).toBe("/");
    visit("/");
    expect(resolveRuntimeBasePath("/")).toBe("/");
  });
});
