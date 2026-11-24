import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, studentAuthState } from "../../../test/router-test-helpers";

const route = "/classes/c1/labs/stats-foundations";
function mockProject(project: Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/api/labs")) {
      return Response.json({
        labs: [
          { id: "stats-foundations", visible: true, visibleClassIds: ["c1"] },
          {
            id: "logistic-regression",
            visible: true,
            visibleClassIds: ["c1"],
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
    const fetch = mockProject(Response.json({ error: "internal-error" }, { status: 500 }));
    await renderAppAt(route, { auth: studentAuthState });
    expect(await screen.findByRole("alert")).toHaveTextContent("服务器出错");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "提交检查本关" })).toBeNull();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("stays in the statistics lab after the final stage even when the next lab is available", async () => {
    mockProject(Response.json({ currentStage: 4, passedStages: [1, 2, 3, 4], drafts: {} }));
    await renderAppAt(route, { auth: studentAuthState });
    expect(await screen.findByRole("button", { name: "Sigmoid 曲线" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /逻辑回归/ })).toBeNull();
  });
});
