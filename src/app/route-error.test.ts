import { describe, expect, it } from "vitest";
import { LabErrorPage } from "./pages/LabErrorPage";
import { appRoutes } from "./router";

describe("lab route resilience", () => {
  it("configures a local error boundary for the calculator lab", () => {
    const route = appRoutes.find((entry) => entry.path === "/classes/:classId/labs/calculator");
    const errorBoundary = route && "info" in route ? route.info?.errorBoundary : undefined;
    expect(errorBoundary).toBe(LabErrorPage);
  });
});
