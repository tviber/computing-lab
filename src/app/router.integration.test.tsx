import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAB_IDS } from "../shared/lab/labMetadata";
import { getRecentLab } from "../shared/lab/recentLab";
import {
  adminAuthState,
  anonymousAuthState,
  renderAppAt,
  studentAuthState,
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

  it("blocks closed logistic-regression entry redirect and class route for non-admins", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/labs")) {
        return new Response(
          JSON.stringify({
            labs: [
              {
                id: "logistic-regression",
                stageCount: 5,
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

    await renderAppAt("/labs/logistic-regression", { auth: teacherAuthState });
    expect(await screen.findByRole("heading", { name: "这个实验暂未开放" })).toBeInTheDocument();
    expect(screen.getByText(/逻辑回归/)).toBeInTheDocument();

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
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

  it.each(["/labs/ml-intro", "/classes/c1/labs/ml-intro"])(
    "redirects %s without dropping classroom or stage parameters",
    async (path) => {
      const { router, history } = await renderAppAt(`${path}?classroom=1&stage=3`, {
        auth: teacherAuthState,
      });
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/classes/c1/labs/logistic-regression"),
      );
      expect(router.state.location.search).toEqual({ classroom: 1, stage: 3 });
      expect(history.length).toBe(1);
    },
  );

  it("keeps one history entry per lab visit so back and forward work", async () => {
    const { router, history } = await renderAppAt("/", { auth: teacherAuthState });
    const card = screen.getByRole("heading", { name: "实现ALU" }).closest("article")!;
    fireEvent.click(within(card).getByRole("link", { name: "开始实验" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/classes/c1/labs/calculator"));
    expect(history.length).toBe(2);

    await act(async () => history.back());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.getByRole("heading", { name: "实验课程" })).toBeInTheDocument();

    await act(async () => history.forward());
    await waitFor(() => expect(router.state.location.pathname).toBe("/classes/c1/labs/calculator"));
    expect(history.length).toBe(2);
  });

  it("records student lab visits through direct class routes", async () => {
    if (studentAuthState.status !== "authenticated") throw new Error("Expected a student session");
    const { id: studentId } = studentAuthState.session.user;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/labs")) {
        return Response.json({
          labs: [{ id: "logistic-regression", visible: true, visibleClassIds: ["c1"] }],
        });
      }
      return Response.json({ currentStage: 1, passedStages: [], drafts: {} });
    });

    const { router } = await renderAppAt("/classes/c1/labs/logistic-regression", {
      auth: studentAuthState,
    });

    try {
      await waitFor(() =>
        expect(getRecentLab(studentId)).toEqual({
          labId: "logistic-regression",
          classId: "c1",
        }),
      );
      await act(async () => router.navigate({ to: "/" }));
      const resume = await screen.findByRole("link", { name: /继续上次实验/ });
      expect(resume).toHaveAttribute("href", "/classes/c1/labs/logistic-regression");
    } finally {
      localStorage.clear();
    }
  });

  it("replaces an anonymous lab entry with login without trapping back navigation", async () => {
    const { router, history } = await renderAppAt("/", { auth: anonymousAuthState });
    await act(async () => router.navigate({ to: "/labs/calculator" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(history.length).toBe(2);

    await act(async () => history.back());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
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
