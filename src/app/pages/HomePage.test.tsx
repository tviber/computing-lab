import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../test/router-test-helpers";
import type { AuthState } from "../../shared/auth";
import { LAB_IDS } from "../../shared/lab/labMetadata";

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
const anonymousAuth: AuthState = {
  status: "anonymous",
  session: null,
};

describe("HomePage lab visibility", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([true, false])(
    "uses only the visible catalog for counts, cards, and resume shortcut (calculator open: %s)",
    async (open) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const path = String(input);
        return Response.json(
          path.includes("/api/labs")
            ? {
                labs: LAB_IDS.map((id) => ({
                  id,
                  visible: open && id === "calculator",
                  visibleClassIds: ["c1"],
                })),
              }
            : path.includes("task-assignments")
              ? { assignments: [] }
              : { currentStage: 2 },
        );
      });
      await renderAppAt("/", { auth: studentAuth });
      expect(
        await screen.findByText(open ? "1 项实验 · 1 个主题" : "0 项实验 · 0 个主题"),
      ).toBeVisible();
      expect(screen.queryAllByRole("article")).toHaveLength(open ? 1 : 0);
      expect(screen.queryByRole("group", { name: "按主题筛选" })).toBeNull();
      if (open) {
        expect(screen.getByRole("heading", { name: "实现ALU" })).toBeVisible();
        const resumeLink = await screen.findByRole("link", { name: /继续上次实验/ });
        expect(within(resumeLink).getByText("实现ALU")).toBeVisible();
      } else {
        expect(screen.queryByRole("link", { name: /继续上次实验/ })).toBeNull();
        expect(screen.getByText(/当前没有开放的实验/)).toBeVisible();
      }
    },
  );

  it("filters visible cards by topic when multiple topics are open", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      return Response.json(
        path.includes("/api/labs")
          ? {
              labs: LAB_IDS.map((id) => ({
                id,
                visible: id === "calculator" || id === "decoding" || id === "image-sampling",
                visibleClassIds: ["c1"],
              })),
            }
          : path.includes("task-assignments")
            ? { assignments: [] }
            : { currentStage: 1 },
      );
    });

    await renderAppAt("/", { auth: studentAuth });

    const filterGroup = await screen.findByRole("group", { name: "按主题筛选" });
    expect(screen.getAllByRole("article")).toHaveLength(3);

    fireEvent.click(within(filterGroup).getByRole("button", { name: /数据与编码/ }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "实现ALU" })).toBeNull();
    expect(screen.getByRole("heading", { name: "解码侦探" })).toBeVisible();

    fireEvent.click(within(filterGroup).getByRole("button", { name: /全部/ }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("switches featured specimen plates on the anonymous landing page", async () => {
    await renderAppAt("/", { auth: anonymousAuth });

    expect(screen.getByRole("heading", { name: "计算实验室" })).toBeVisible();
    expect(within(screen.getByRole("figure")).getByText("空间采样")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "实现ALU" }));
    expect(within(screen.getByRole("figure")).getByText("实现ALU")).toBeVisible();
  });

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
                id: "logistic-regression",
                stageCount: 5,
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
    expect(screen.queryByRole("heading", { name: "逻辑回归" })).not.toBeInTheDocument();
  });

  it("shows hidden labs badged for admins and requires class membership to enter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          labs: [
            {
              id: "logistic-regression",
              stageCount: 5,
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

    const card = await screen.findByRole("heading", { name: "逻辑回归" });
    const article = card.closest("article");
    expect(article).not.toBeNull();
    expect(within(article!).getByText("人工智能")).toBeInTheDocument();
    expect(within(article!).queryByText("信息系统")).not.toBeInTheDocument();
    expect(within(article!).getByText(/已隐藏/)).toBeInTheDocument();
    expect(within(article!).getByText("请先加入班级，再开始实验。")).toBeInTheDocument();
  });
});
