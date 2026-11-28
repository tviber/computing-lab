import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGISTIC_REGRESSION_STAGES } from "../../features/logistic-regression";
import type { AuthState } from "../../shared/auth";
import { LAB_IDS, labMetadata } from "../../shared/lab/labMetadata";
import { renderAppAt } from "../../test/router-test-helpers";

const multiClassTeacher: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [
      { classId: "c11", className: "2026-高二信息技术-11", role: "teacher" },
      { classId: "c12", className: "2026-高二信息技术-12", role: "teacher" },
    ],
  },
};

describe("TeacherDashboardPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets a teacher switch between class dashboards", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ classId: "c11", className: "2026-高二信息技术-11", rows: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { router } = await renderAppAt("/classes/c11/dashboard", { auth: multiClassTeacher });
    expect(await screen.findByRole("combobox", { name: "选择班级" })).toHaveValue("c11");
    expect(screen.getByRole("option", { name: "2026-高二信息技术-12" })).toBeInTheDocument();
    expect(screen.getByLabelText("学生进度横向滚动区")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "选择班级" }), "c12");
    await waitFor(() => expect(router.location.pathname).toBe("/classes/c12/dashboard"));
  });

  it("renders decoding parts in the failure drawer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/sub-1")
        ? {
            id: "sub-1",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 1,
            score: 0,
            total: 1,
            passed: false,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              parts: [
                {
                  id: "text",
                  label: "解码出的文本",
                  ok: false,
                  detail: "第 1 个字符不符",
                },
              ],
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=decoding")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 1,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 0,
                      total: 1,
                      passed: false,
                      submissionId: "sub-1",
                      submittedAt: "2026-10-11T00:00:00.000Z",
                    },
                  },
                  lastActiveAt: null,
                },
              ],
            }
          : { labs: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/classes/c11/dashboard?lab=decoding", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByRole("button", { name: "0/1" }));

    expect(await screen.findByText("解码出的文本")).toBeInTheDocument();
    expect(screen.getByText("第 1 个字符不符")).toBeInTheDocument();
  });

  it("uses the registered statistics renderer and preserves raw answers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/submissions/stats-sub")) {
        return Response.json({
          id: "stats-sub",
          studentNo: "20260101",
          name: "张三",
          stageIndex: 2,
          score: 0,
          total: 1,
          passed: false,
          submittedAt: "2026-10-11T00:00:00.000Z",
          testSummary: {
            parts: [
              {
                id: "conditional-probability",
                label: "概率核对",
                ok: false,
                detail: "legacy value",
                feedback: "请核对 $P(A)$。",
                answerSummary: "$x^2$",
              },
            ],
          },
        });
      }
      if (path.includes("dashboard?lab=stats-foundations")) {
        return Response.json({
          classId: "c11",
          className: "实验班",
          rows: [
            {
              userId: "student",
              studentNo: "20260101",
              name: "张三",
              currentStage: 2,
              lastActiveAt: null,
              cells: {
                2: {
                  stageIndex: 2,
                  score: 0,
                  total: 1,
                  passed: false,
                  submissionId: "stats-sub",
                  submittedAt: "2026-10-11T00:00:00.000Z",
                },
              },
            },
          ],
        });
      }
      return Response.json({ labs: [] });
    });
    await renderAppAt("/classes/c11/dashboard?lab=stats-foundations", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByRole("button", { name: "0/1" }));
    expect(await screen.findByText("概率核对")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.querySelector("annotation")).toHaveTextContent("P(A)"));
    expect(dialog).toHaveTextContent("$x^2$");
    expect(dialog.querySelectorAll("math")).toHaveLength(1);
  });

  it("shows concise Chinese stage names and keeps preview separate from destructive actions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/api/labs")
        ? Response.json({ labs: [] })
        : Response.json({
            classId: "c11",
            className: "示范班",
            rows: [
              {
                userId: "u1",
                studentNo: "001",
                name: "学生",
                currentStage: 1,
                cells: {
                  1: {
                    stageIndex: 1,
                    score: 1,
                    total: 2,
                    passed: false,
                    submissionId: "s1",
                    submittedAt: "2026-01-01",
                  },
                },
                lastActiveAt: null,
              },
            ],
          }),
    );
    await renderAppAt("/classes/c11/dashboard?lab=calculator", { auth: multiClassTeacher });
    expect(screen.getByRole("columnheader", { name: /连接导线/ })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "First Wire" })).toBeNull();
    expect(await screen.findByRole("button", { name: "1/2" })).toHaveClass("cell-score");
    expect(screen.getByRole("button", { name: "预览画布" })).toHaveClass("matrix-action");
    expect(screen.getByRole("button", { name: "清空记录" })).toHaveClass("is-destructive");
  });

  it("shows completed / total students in every stage column", async () => {
    const passedCell = (stageIndex: number, submissionId: string) => ({
      stageIndex,
      score: 1,
      total: 1,
      passed: true,
      submissionId,
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/api/labs")
        ? Response.json({ labs: [] })
        : Response.json({
            classId: "c11",
            className: "示范班",
            rows: [
              {
                userId: "u1",
                studentNo: "001",
                name: "甲",
                currentStage: 2,
                cells: {
                  1: passedCell(1, "s1"),
                  2: passedCell(2, "s2"),
                },
                lastActiveAt: null,
              },
              {
                userId: "u2",
                studentNo: "002",
                name: "乙",
                currentStage: 1,
                cells: { 1: passedCell(1, "s3") },
                lastActiveAt: null,
              },
            ],
          }),
    );

    await renderAppAt("/classes/c11/dashboard?lab=calculator", { auth: multiClassTeacher });

    await screen.findByText("甲");
    const firstStage = await screen.findByRole("meter", { name: "连接导线完成人数" });
    expect(firstStage).toHaveAttribute("aria-valuenow", "2");
    expect(firstStage).toHaveAttribute("aria-valuemax", "2");
    expect(firstStage).toHaveClass("is-complete");
    expect(within(firstStage).getByText("2/2")).toBeInTheDocument();

    const secondStage = screen.getByRole("meter", { name: "半加器完成人数" });
    expect(secondStage).toHaveAttribute("aria-valuenow", "1");
    expect(within(secondStage).getByText("1/2")).toBeInTheDocument();
  });

  it("lists all labs and marks the five-stage logistic regression experience completed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/logistic-regression-sub-5")
        ? {
            id: "logistic-regression-sub-5",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 5,
            score: 1,
            total: 1,
            passed: true,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              parts: [{ id: "experience", label: "短信分类体验", ok: true, detail: null }],
              detail: "已完成短信分类体验。",
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=logistic-regression")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 6,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 9,
                      total: 9,
                      passed: true,
                      submissionId: "logistic-regression-sub-1",
                      submittedAt: "2026-10-11T00:00:00.000Z",
                    },
                    5: {
                      stageIndex: 5,
                      score: 1,
                      total: 1,
                      passed: true,
                      submissionId: "logistic-regression-sub-5",
                      submittedAt: "2026-10-11T00:05:00.000Z",
                    },
                  },
                  lastActiveAt: "2026-10-11T00:05:00.000Z",
                },
              ],
            }
          : { labs: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderAppAt("/classes/c11/dashboard?lab=logistic-regression", {
      auth: multiClassTeacher,
    });

    const labSelect = screen.getByRole("combobox", { name: "选择实验" });
    expect(labSelect).toHaveValue("logistic-regression");
    expect(Array.from(labSelect.querySelectorAll("option")).map((option) => option.value)).toEqual(
      LAB_IDS,
    );
    for (const meta of Object.values(labMetadata)) {
      expect(screen.getByRole("option", { name: meta.title })).toBeInTheDocument();
    }

    for (const stage of LOGISTIC_REGRESSION_STAGES.filter((item) => !item.optional)) {
      expect(screen.getByRole("columnheader", { name: stage.title })).toBeInTheDocument();
    }

    const studentRow = await screen.findByRole("row", { name: /20260101.*张三/ });
    const stageFiveCell =
      within(studentRow).getAllByRole("cell")[
        LOGISTIC_REGRESSION_STAGES.filter((item) => !item.optional).length
      ];
    expect(stageFiveCell.querySelector(".cell-pass")).toBeInTheDocument();
  });

  async function openTeacherWithClosedLogisticRegression(closedLabFetch: () => Promise<Response>) {
    const teacherAuth: AuthState = {
      status: "authenticated",
      session: {
        user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
        memberships: [{ classId: "c11", className: "2026-高二信息技术-11", role: "teacher" }],
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/labs")) {
        return new Response(
          JSON.stringify({
            labs: [
              { id: "calculator", visible: true, visibleClassIds: ["c11"] },
              { id: "logistic-regression", visible: true, visibleClassIds: [] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (path.includes("lab=logistic-regression")) return closedLabFetch();
      return new Response(
        JSON.stringify({
          classId: "c11",
          className: "2026-高二信息技术-11",
          rows: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await renderAppAt("/classes/c11/dashboard?lab=logistic-regression", { auth: teacherAuth });

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "选择实验" })).toHaveValue("calculator"),
    );
    expect(await screen.findByText("还没有学生加入这个班级。")).toBeInTheDocument();
  }

  it("clears the transient closed-lab error when catalog filtering falls back to an open lab", async () => {
    await openTeacherWithClosedLogisticRegression(
      async () =>
        new Response(JSON.stringify({ error: "lab-not-available" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a late 403 error from logistic-regression after falling back to calculator", async () => {
    let resolveStaleClosed!: (response: Response) => void;
    const staleClosed = new Promise<Response>((resolve) => {
      resolveStaleClosed = resolve;
    });

    await openTeacherWithClosedLogisticRegression(() => staleClosed);

    resolveStaleClosed(
      new Response(JSON.stringify({ error: "lab-not-available" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the newest class matrix when an older response resolves late", async () => {
    let resolveOld!: (response: Response) => void;
    const oldMatrix = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const row = (studentNo: string, name: string) => ({
      userId: studentNo,
      studentNo,
      name,
      currentStage: 1,
      cells: {},
      lastActiveAt: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = String(input);
      if (path.endsWith("/api/labs")) return Promise.resolve(Response.json({ labs: [] }));
      if (path.includes("/api/classes/c11/dashboard")) return oldMatrix;
      return Promise.resolve(
        Response.json({
          classId: "c12",
          className: "2026-高二信息技术-12",
          rows: [row("001", "新班级学生")],
        }),
      );
    });

    await renderAppAt("/classes/c11/dashboard?lab=calculator", { auth: multiClassTeacher });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("/api/classes/c11/dashboard")),
      ).toBe(true),
    );
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "选择班级" }), "c12");
    expect(await screen.findByText("新班级学生")).toBeInTheDocument();

    resolveOld(
      Response.json({
        classId: "c11",
        className: "2026-高二信息技术-11",
        rows: [row("002", "旧班级学生")],
      }),
    );
    await waitFor(() => expect(screen.queryByText("旧班级学生")).not.toBeInTheDocument());
    expect(screen.getByText("新班级学生")).toBeInTheDocument();
  });

  it("does not let a closed submission response overwrite a newer detail", async () => {
    let resolveOld!: (response: Response) => void;
    const oldDetail = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const cell = (stageIndex: number, score: number, total: number, submissionId: string) => ({
      stageIndex,
      score,
      total,
      passed: false,
      submissionId,
      submittedAt: "2026-10-11T00:00:00.000Z",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = String(input);
      if (path.endsWith("/api/labs")) return Promise.resolve(Response.json({ labs: [] }));
      if (path.includes("/submissions/old")) return oldDetail;
      if (path.includes("/submissions/new")) {
        return Promise.resolve(
          Response.json({
            id: "new",
            studentNo: "002",
            name: "新详情",
            stageIndex: 2,
            score: 2,
            total: 3,
            passed: false,
            submittedAt: "2026-10-11T00:05:00.000Z",
            testSummary: { parts: [{ id: "new-part", label: "新结果", ok: false }] },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          classId: "c11",
          className: "2026-高二信息技术-11",
          rows: [
            {
              userId: "u1",
              studentNo: "001",
              name: "学生",
              currentStage: 2,
              cells: {
                1: cell(1, 1, 2, "old"),
                2: cell(2, 2, 3, "new"),
              },
              lastActiveAt: null,
            },
          ],
        }),
      );
    });

    await renderAppAt("/classes/c11/dashboard?lab=decoding", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByRole("button", { name: "1/2" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "2/3" }));
    expect(await screen.findByText("新结果")).toBeInTheDocument();
    resolveOld(
      Response.json({
        id: "old",
        studentNo: "001",
        name: "旧详情",
        stageIndex: 1,
        score: 1,
        total: 2,
        passed: false,
        submittedAt: "2026-10-11T00:00:00.000Z",
        testSummary: { parts: [{ id: "old-part", label: "旧结果", ok: false }] },
      }),
    );
    await waitFor(() => expect(screen.queryByText("旧结果")).not.toBeInTheDocument());
    expect(screen.getByText("新结果")).toBeInTheDocument();
  });
});
