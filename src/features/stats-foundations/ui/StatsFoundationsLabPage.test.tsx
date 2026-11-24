import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, studentAuthState } from "../../../test/router-test-helpers";

const route = "/classes/c1/labs/stats-foundations";
function mockProject(project: Response, nextClasses: string[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/api/labs")) {
      return Response.json({
        labs: [
          { id: "stats-foundations", visible: true, visibleClassIds: ["c1"] },
          {
            id: "logistic-regression",
            visible: nextClasses.length > 0,
            visibleClassIds: nextClasses,
          },
        ],
      });
    }
    return project.clone();
  });
}

describe("统计基础实验访问与保存", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps all editing controls closed after the project request fails", async () => {
    const fetch = mockProject(Response.json({ error: "internal-error" }, { status: 500 }), ["c1"]);
    await renderAppAt(route, { auth: studentAuthState });
    expect(await screen.findByRole("alert")).toHaveTextContent("服务器出错");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "提交检查本关" })).toBeNull();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it.each([
    { classes: ["c2"], open: false },
    { classes: [], open: false },
    { classes: ["c1"], open: true },
  ])("checks next lesson access for $classes", async ({ classes, open }) => {
    mockProject(
      Response.json({ currentStage: 4, passedStages: [1, 2, 3, 4], drafts: {} }),
      classes,
    );
    await renderAppAt(route, { auth: studentAuthState });
    expect(await screen.findByRole("button", { name: "提交检查本关" })).toBeVisible();
    if (open) expect(await screen.findByRole("link", { name: /前往下一课/ })).toBeVisible();
    else expect(screen.queryByRole("link", { name: /前往下一课/ })).toBeNull();
  });
});
