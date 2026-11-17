import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../test/router-test-helpers";
import type { AuthState } from "../../shared/auth";

const studentAuth: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20260101", name: "学生", role: "user" },
    memberships: [{ classId: "c1", className: "一班", role: "student" }],
  },
};
const adminWithoutClassAuth: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin-no-class", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [],
  },
};

describe("HomePage lab visibility", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hides closed or hidden labs from students while keeping open labs visible", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/api/labs")
        ? {
            labs: [
              {
                id: "calculator",
                stageCount: 11,
                hidden: false,
                openClassIds: null,
                visible: true,
                visibleClassIds: ["c1"],
              },
              {
                id: "ml-intro",
                stageCount: 6,
                hidden: true,
                openClassIds: null,
                visible: false,
                visibleClassIds: [],
              },
            ],
          }
        : path.includes("/task-assignments")
          ? { assignments: [] }
          : { currentStage: 1 };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/", { auth: studentAuth });

    expect(await screen.findByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "机器学习入门" })).not.toBeInTheDocument();
  });

  it("shows hidden labs badged for admins and requires class membership to enter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          labs: [
            {
              id: "ml-intro",
              stageCount: 6,
              hidden: true,
              openClassIds: null,
              visible: true,
              visibleClassIds: [],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await renderAppAt("/", { auth: adminWithoutClassAuth });

    const card = await screen.findByRole("heading", { name: "机器学习入门" });
    const article = card.closest("article");
    expect(article).not.toBeNull();
    expect(within(article!).getByText("人工智能")).toBeInTheDocument();
    expect(within(article!).queryByText("信息系统")).not.toBeInTheDocument();
    expect(within(article!).getByText(/已隐藏/)).toBeInTheDocument();
    expect(within(article!).getByText("请先加入班级，再开始实验。")).toBeInTheDocument();
  });
});
