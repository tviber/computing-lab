import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ML_STAGES } from "../../features/ml-intro";
import type { AuthState } from "../../shared/auth";
import { labMetadata } from "../../shared/lab/labMetadata";
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

  it("renders decoding parts in the failure drawer and shows recorded CPU predictions", async () => {
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
              predictions: [
                {
                  promptId: "first-fetch",
                  prompt: "机器从哪一格取指？",
                  selected: "第 14 格",
                  correct: false,
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
    expect(screen.getByRole("region", { name: "预测首答" })).toHaveTextContent("第 14 格");
  });

  it("lets teachers inspect first predictions after a CPU stage passes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/cpu-sub")
        ? {
            id: "cpu-sub",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 1,
            score: 3,
            total: 3,
            passed: true,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              categories: { basic: { passed: 3, total: 3 } },
              predictions: [
                {
                  promptId: "first-fetch",
                  prompt: "机器从哪一格取指？",
                  selected: "第 14 格",
                  correct: false,
                },
              ],
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=cpu")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 2,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 3,
                      total: 3,
                      passed: true,
                      submissionId: "cpu-sub",
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

    await renderAppAt("/classes/c11/dashboard?lab=cpu", { auth: multiClassTeacher });
    await userEvent.click(await screen.findByTitle("查看提交详情"));

    expect(await screen.findByRole("region", { name: "预测首答" })).toHaveTextContent("第 14 格");
  });

  it("includes every judged lab and renders ml-intro progress and part details", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const payload = path.includes("/submissions/ml-sub-5")
        ? {
            id: "ml-sub-5",
            studentNo: "20260101",
            name: "张三",
            stageIndex: 5,
            score: 4,
            total: 6,
            passed: false,
            submittedAt: "2026-10-11T00:00:00.000Z",
            testSummary: {
              parts: [
                {
                  id: "val-loss",
                  label: "公开验证损失稳定 (≤ 0.14)",
                  ok: true,
                  detail: "训练样本 1400 条，验证损失 0.102",
                },
                {
                  id: "hidden-blind-exam",
                  label: "300 条隐藏测试集结业盲测",
                  ok: false,
                  detail: "盲测未达标：当前模型在未见短信上的准确率、Precision 或 Recall 尚有短板",
                },
                {
                  id: "concepts",
                  label: "概念检查",
                  ok: true,
                  detail: "3 / 3 题全对",
                },
              ],
              detail: "公开验证损失已稳定，但 300 条隐藏盲测尚未同时达标。",
            },
          }
        : path.includes("/api/classes/c11/dashboard?lab=ml-intro")
          ? {
              classId: "c11",
              className: "2026-高二信息技术-11",
              rows: [
                {
                  userId: "u-student",
                  studentNo: "20260101",
                  name: "张三",
                  currentStage: 5,
                  cells: {
                    1: {
                      stageIndex: 1,
                      score: 10,
                      total: 10,
                      passed: true,
                      submissionId: "ml-sub-1",
                      submittedAt: "2026-10-11T00:00:00.000Z",
                    },
                    5: {
                      stageIndex: 5,
                      score: 4,
                      total: 6,
                      passed: false,
                      submissionId: "ml-sub-5",
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

    await renderAppAt("/classes/c11/dashboard?lab=ml-intro", { auth: multiClassTeacher });

    const labSelect = screen.getByRole("combobox", { name: "选择实验" });
    expect(labSelect).toHaveValue("ml-intro");
    for (const [id, meta] of Object.entries(labMetadata)) {
      if (id === "audio-encoding") continue;
      expect(screen.getByRole("option", { name: meta.title })).toBeInTheDocument();
    }

    for (const stage of ML_STAGES) {
      expect(
        screen.getByRole("columnheader", { name: stage.englishTitle ?? stage.title }),
      ).toBeInTheDocument();
    }

    await userEvent.click(await screen.findByRole("button", { name: "4/6" }));
    expect(await screen.findByText("300 条隐藏测试集结业盲测")).toBeInTheDocument();
    expect(
      screen.getByText("盲测未达标：当前模型在未见短信上的准确率、Precision 或 Recall 尚有短板"),
    ).toBeInTheDocument();
  });

  async function openTeacherWithClosedMlIntro(closedLabFetch: () => Promise<Response>) {
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
              { id: "ml-intro", visible: true, visibleClassIds: [] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (path.includes("lab=ml-intro")) return closedLabFetch();
      return new Response(
        JSON.stringify({
          classId: "c11",
          className: "2026-高二信息技术-11",
          rows: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await renderAppAt("/classes/c11/dashboard?lab=ml-intro", { auth: teacherAuth });

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "选择实验" })).toHaveValue("calculator"),
    );
    expect(await screen.findByText("还没有学生加入这个班级。")).toBeInTheDocument();
  }

  it("clears the transient closed-lab error when catalog filtering falls back to an open lab", async () => {
    await openTeacherWithClosedMlIntro(
      async () =>
        new Response(JSON.stringify({ error: "lab-not-available" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a late 403 error from ml-intro after falling back to calculator", async () => {
    let resolveStaleClosed!: (response: Response) => void;
    const staleClosed = new Promise<Response>((resolve) => {
      resolveStaleClosed = resolve;
    });

    await openTeacherWithClosedMlIntro(() => staleClosed);

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
