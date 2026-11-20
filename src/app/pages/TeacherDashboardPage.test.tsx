import { screen, waitFor, within } from "@testing-library/react";
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

    const { history } = await renderAppAt("/classes/c11/dashboard", { auth: multiClassTeacher });
    expect(screen.getByRole("combobox", { name: "选择班级" })).toHaveValue("c11");
    expect(screen.getByRole("option", { name: "2026-高二信息技术-12" })).toBeInTheDocument();
    expect(screen.getByLabelText("学生进度横向滚动区")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "选择班级" }), "c12");
    await waitFor(() => expect(history.location.pathname).toBe("/classes/c12/dashboard"));
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

    for (const stage of LOGISTIC_REGRESSION_STAGES) {
      expect(screen.getByRole("columnheader", { name: stage.title })).toBeInTheDocument();
    }

    const studentRow = await screen.findByRole("row", { name: /20260101.*张三/ });
    const stageFiveCell =
      within(studentRow).getAllByRole("cell")[LOGISTIC_REGRESSION_STAGES.length];
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
});
