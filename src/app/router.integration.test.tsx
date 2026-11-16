import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAB_IDS } from "../shared/lab/labMetadata";
import {
  adminAuthState,
  anonymousAuthState,
  renderAppAt,
  teacherAuthState,
} from "../test/router-test-helpers";

describe("application router integration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the signed-in name only inside the account dropdown trigger", async () => {
    await renderAppAt("/", { auth: teacherAuthState });

    const topbar = screen.getByRole("banner");
    expect(within(topbar).getAllByText("教师", { exact: true })).toHaveLength(1);
    expect(within(topbar).getByRole("button", { name: /教师/ })).toBeInTheDocument();
    expect(within(topbar).queryByText("teacher", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the calculator lab on the classroom home", async () => {
    await renderAppAt("/", { auth: teacherAuthState });

    expect(screen.getByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    const calcCard = screen.getByRole("heading", { name: "实现ALU" }).closest("article");
    expect(calcCard).not.toBeNull();
    expect(within(calcCard as HTMLElement).getByRole("link", { name: "开始实验" })).toHaveAttribute(
      "href",
      "/labs/calculator",
    );
  });

  it("renders every homepage lab from the same card pattern and action label", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/api/labs")
        ? {
            labs: LAB_IDS.map((id) => ({
              id,
              stageCount: 1,
              hidden: false,
              openClassIds: null,
              visible: true,
              visibleClassIds: ["c1"],
            })),
          }
        : path.includes("/task-assignments")
          ? { assignments: [] }
          : { currentStage: 1 };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await renderAppAt("/", { auth: teacherAuthState });

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(LAB_IDS.length);
    for (const card of cards) {
      expect(within(card).getByRole("link", { name: "开始实验" })).toBeInTheDocument();
    }
  });

  it("blocks closed ml-intro entry redirect and class route for non-admins", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/labs")) {
        return new Response(
          JSON.stringify({
            labs: [
              {
                id: "ml-intro",
                stageCount: 6,
                hidden: true,
                openClassIds: null,
                visible: false,
                visibleClassIds: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/labs/ml-intro", { auth: teacherAuthState });
    expect(await screen.findByRole("heading", { name: "这个实验暂未开放" })).toBeInTheDocument();
    expect(screen.getByText(/机器学习入门/)).toBeInTheDocument();

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    expect(
      (await screen.findAllByRole("heading", { name: "这个实验暂未开放" })).length,
    ).toBeGreaterThan(0);
  });

  it("lets teachers enter an open image-sampling lab", async () => {
    const { router } = await renderAppAt("/labs/image-sampling", { auth: teacherAuthState });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/classes/c1/labs/image-sampling"),
    );
    expect(screen.queryByText(/仅对管理员开放预览/)).not.toBeInTheDocument();
  });

  it("shows the calculator lab and account menu to admins", async () => {
    await renderAppAt("/", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "实现ALU" })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /管理员/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "账号管理" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("menuitem", { name: "班级管理" })).toHaveAttribute(
      "href",
      "/admin/classes",
    );
    expect(screen.getByRole("menuitem", { name: "实验管理" })).toHaveAttribute(
      "href",
      "/admin/labs",
    );
    expect(screen.getByRole("menuitem", { name: "班级看板" })).toBeInTheDocument();
  });

  it("shows anonymous visitors a landing page with a sign-in entry", async () => {
    await renderAppAt("/", { auth: anonymousAuthState });

    expect(screen.getByRole("heading", { name: "计算实验室" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^登录/ })).toHaveAttribute("href", "/login");
  });
});
