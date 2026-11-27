import { fireEvent, screen, waitFor, within } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminAuthState,
  renderAppAt,
  studentAuthState,
  teacherAuthState,
} from "../../../test/router-test-helpers.tsx";
import type {
  LogisticRegressionJudgeResult,
  LogisticRegressionProjectPayload,
} from "../domain/protocol.ts";
import { LOGISTIC_REGRESSION_STAGES } from "../domain/stages.ts";
import { STRATEGY_WORDS } from "../domain/strategy.ts";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeProject(
  overrides: Partial<LogisticRegressionProjectPayload> = {},
): LogisticRegressionProjectPayload {
  return {
    currentStage: 1,
    passedStages: [],
    drafts: {},
    draftRevisions: {},
    runSummaries: { s1: null, s2: null, s3: null, s4: null, s5: null, s6: null },
    ...overrides,
  };
}

function stubLogisticRegressionFetch(
  project: LogisticRegressionProjectPayload,
  onJudge: (body: { stageIndex: number; draft: unknown }) => Promise<Response> | Response,
) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/judge")) {
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      return onJudge(parsed);
    }
    if (url.includes("/draft")) {
      return json({ applied: true, revision: 4 });
    }
    if (url.includes("/project")) {
      return json(project);
    }
    if (url.includes("/api/labs")) {
      return json({ labs: [{ id: "logistic-regression", visible: true }] });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("LogisticRegressionLabPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders stage 1 10-word strategy workspace with stage 2 locked for students", async () => {
    stubLogisticRegressionFetch(makeProject(), () => json({}));

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: studentAuthState });

    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });
    await screen.findByRole("radiogroup", { name: "中奖 倾向设置" });
    for (const word of STRATEGY_WORDS) {
      expect(screen.getByRole("radiogroup", { name: `${word} 倾向设置` })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "第一条短信的算分过程" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交第 1 关判定" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /从短信到数字/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重置进度" })).toBeEnabled();
  });

  it("classifies new messages using the saved training parameters without a quiz", async () => {
    const fetchSpy = stubLogisticRegressionFetch(
      makeProject({
        currentStage: 5,
        passedStages: [1, 2, 3, 4],
        drafts: { 4: { eta: 0.001, epochs: 1, inspectEpoch: 1, showBgd: false } },
        trainedSettings: { eta: 0.16, epochs: 14 },
      }),
      () =>
        json({
          passed: true,
          currentStage: 6,
          passedStages: [1, 2, 3, 4, 5],
          testSummary: { parts: [], detail: "已完成短信分类体验。" },
        }),
    );
    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 用新短信试试模型" });
    expect(screen.getByText(/学习率 0.16 · 14 轮 · 系统阈值/)).toBeInTheDocument();
    expect(screen.queryByText("概念检查")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /误报与漏报/ })).not.toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "完成体验" });
    expect(finish).toBeDisabled();
    fireEvent.input(screen.getByLabelText("短信内容"), { target: { value: "明天来学校开会" } });
    flush();
    expect(screen.getByText(/模型分类：/)).toBeInTheDocument();
    expect(finish).toBeDisabled();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "短信示例" })).getByRole("radio", {
        name: "促销短信",
      }),
    );
    flush();
    expect(screen.getByText("模型分类：垃圾短信")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "短信示例" })).getByRole("radio", {
        name: "日常消息",
      }),
    );
    flush();
    expect(screen.getByText("模型分类：正常短信")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("短信内容"), { target: { value: "明天来学校开会" } });
    flush();
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    flush();
    expect(await screen.findByText("已完成短信分类体验")).toBeInTheDocument();
    const request = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/judge"));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      stageIndex: 5,
      expectedGeneration: 0,
      draft: { activity: "sms-classification", exampleId: "everyday", prediction: 0 },
    });
  });

  it("explains the data splits and distinguishes replay from model training", async () => {
    stubLogisticRegressionFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
        drafts: { 4: { eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false } },
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 训练模型" });

    expect(screen.getByText(/训练集的 1,400 条短信用于更新权重/)).toBeInTheDocument();
    expect(screen.getByText(/SGD 每读一条就更新一次/)).toBeInTheDocument();
    fireEvent.input(screen.getByRole("slider", { name: "回放轮次" }), { target: { value: "0" } });
    flush();
    expect(screen.getByText(/第 0 轮是训练前的权重/)).toBeInTheDocument();
    expect(screen.getByText(/下面只回放已有结果，不改变最终提交的模型/)).toBeInTheDocument();
  });

  it("completes stage 1 weights + concepts, passes judge, and unlocks stage 2", async () => {
    const passResult: LogisticRegressionJudgeResult = {
      passed: true,
      score: 9,
      total: 9,
      submissionId: "sub-1",
      currentStage: 2,
      passedStages: [1],
      testSummary: {
        parts: [
          { id: "strategy-sms", label: "6 条 10 词短信分类", ok: true, detail: "6 / 6 条全部分对" },
          { id: "concepts", label: "概念检查", ok: true, detail: "2 / 2 题全对" },
        ],
        detail: "10 词点积策略全部命中，解锁第 2 关探索真实词袋。",
      },
    };

    const fetchSpy = stubLogisticRegressionFetch(makeProject(), () => json(passResult));
    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });
    await screen.findByRole("radiogroup", { name: "中奖 倾向设置" });

    const results = within(screen.getByRole("list", { name: "6 条短信的分类结果" }));
    expect(results.getAllByRole("listitem")).toHaveLength(6);
    expect(results.queryByRole("button")).not.toBeInTheDocument();
    const firstResult = within(results.getAllByRole("listitem")[0]);
    expect(firstResult.getByText("漏拦")).toBeInTheDocument();
    expect(
      firstResult.getByText(String.raw`w\cdot x = 0`, { selector: "annotation" }).closest("math"),
    ).not.toBeNull();

    const tierSelections: Record<string, string> = {
      中奖: "+2 强垃圾",
      发票: "+1 偏垃圾",
      退款: "+1 偏垃圾",
      优惠: "+1 偏垃圾",
      妈妈: "−2 强正常",
      开会: "−1 偏正常",
      老师: "−1 偏正常",
    };
    for (const [word, tierLabel] of Object.entries(tierSelections)) {
      const group = screen.getByRole("radiogroup", { name: `${word} 倾向设置` });
      fireEvent.click(within(group).getByRole("radio", { name: tierLabel }));
      flush();
    }

    expect(screen.getByText("判对 6 / 6")).toBeInTheDocument();
    expect(firstResult.getByText("正确拦截")).toBeInTheDocument();
    expect(
      firstResult.getByText(String.raw`w\cdot x = +4`, { selector: "annotation" }).closest("math"),
    ).not.toBeNull();

    for (const prompt of LOGISTIC_REGRESSION_STAGES[0].prompts) {
      const btn = await screen.findByRole("button", { name: prompt.options[prompt.correct].label });
      fireEvent.click(btn);
      flush();
    }

    const submitBtn = screen.getByRole("button", { name: "提交第 1 关判定" });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);
    flush();

    await screen.findByText("通过本关判定");
    expect(screen.getByText(/本关收获/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/classes/c1/labs/logistic-regression/judge"),
      expect.objectContaining({ method: "POST" }),
    );

    const stage2Nav = screen.getByRole("button", { name: /从短信到数字/ });
    expect(stage2Nav).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /进入下一关/ }));
    flush();
    await screen.findByRole("heading", { name: "逻辑回归 - 从短信到数字" });
  });

  it("keeps stage 2 locked and displays verdict details on failed submission", async () => {
    const failResult: LogisticRegressionJudgeResult = {
      passed: false,
      score: 6,
      total: 9,
      submissionId: "sub-fail",
      currentStage: 1,
      passedStages: [],
      testSummary: {
        parts: [
          {
            id: "strategy-sms",
            label: "6 条 10 词短信分类",
            ok: false,
            detail: "5 / 6 条分对（未过：含报销词的日常）",
          },
        ],
        detail: "请调整 10 个词的权重策略并完成概念题。",
      },
    };

    stubLogisticRegressionFetch(makeProject(), () => json(failResult));
    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });

    fireEvent.click(
      within(await screen.findByRole("radiogroup", { name: "中奖 倾向设置" })).getByRole("radio", {
        name: "+2 强垃圾",
      }),
    );
    flush();
    for (const prompt of LOGISTIC_REGRESSION_STAGES[0].prompts) {
      fireEvent.click(
        await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
      );
      flush();
    }

    fireEvent.click(screen.getByRole("button", { name: "提交第 1 关判定" }));
    flush();

    await screen.findByText("尚未通过本关");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /从短信到数字/ })).toBeDisabled(),
    );
  });

  it("restores saved Stage 1 draft from server and autosaves updates", async () => {
    const project = makeProject({
      currentStage: 1,
      passedStages: [],
      drafts: {
        "1": {
          weights: { 中奖: 1, 妈妈: -2 },
          selectedMsgId: "st-ham-1",
          concepts: { "dot-product-strategy": 1 },
        },
      },
      draftRevisions: { "1": 3 },
    });
    const fetchSpy = stubLogisticRegressionFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });

    const prizeGroup = await screen.findByRole("radiogroup", { name: "中奖 倾向设置" });
    expect(within(prizeGroup).getByRole("radio", { name: "+1 偏垃圾" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const momGroup = screen.getByRole("radiogroup", { name: "妈妈 倾向设置" });
    expect(within(momGroup).getByRole("radio", { name: "−2 强正常" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(within(prizeGroup).getByRole("radio", { name: "+2 强垃圾" }));
    await waitFor(
      () =>
        expect(
          fetchSpy.mock.calls.some(([url, init]) => {
            const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
            if (!u.includes("/labs/logistic-regression/draft") || init?.method !== "PUT")
              return false;
            const parsed = init.body ? JSON.parse(String(init.body)) : {};
            return parsed.stageIndex === 1 && parsed.draft?.weights?.["中奖"] === 2;
          }),
        ).toBe(true),
      { timeout: 3000 },
    );
    await screen.findByText("已保存");
  });

  it("renders Stage 3 Sigmoid curve with all 6 calibration messages and prefilled blacklist starter", async () => {
    const project = makeProject({
      currentStage: 3,
      passedStages: [1, 2],
    });
    stubLogisticRegressionFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 从分数到概率" });

    const chart = screen.getByLabelText("Sigmoid 曲线与当前模型定位");
    expect(chart).toBeInTheDocument();
    expect(chart.querySelectorAll("circle").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(/没有已知词时的垃圾概率：59\.9%/)).toBeInTheDocument();

    const hamDotTitle = within(chart as unknown as HTMLElement).getByText(/含「免费」的正常短信/);
    fireEvent.click(hamDotTitle.closest("g")!);
    flush();
    expect(screen.getByText(/当前选中的短信拆解：含「免费」的正常短信/)).toBeInTheDocument();
  });

  it("keeps Stage 4 focused on training metrics and the single-step gradient intuition", async () => {
    stubLogisticRegressionFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
        drafts: { 4: { eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false } },
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 训练模型" });

    const beforeAfter = screen.getByLabelText("训练前后验证短信表现对比");
    expect(beforeAfter).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/训练前（全 0 权重各猜 50%）/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/分对 42 \/ 300 条（14\.0%）/)).toBeInTheDocument();
    expect(
      within(beforeAfter).getByText(/多数类 \/ 先验基线（不学词 · 按训练集估计）/),
    ).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/分对 258 \/ 300 条（86\.0%）/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/按训练集垃圾占比/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/准确率：已超过 86\.0% 多数类基线/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/BCE Loss 0\.6931 →/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/优于训练集固定先验基线/)).toBeInTheDocument();
    expect(screen.getByText(/这一关先观察模型如何用它更新权重/)).toBeInTheDocument();
    expect(screen.getByLabelText("预测概率与损失")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "权重改变量" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "数学推导" })).not.toBeInTheDocument();
    expect(screen.queryByText("从极大似然到最小化交叉熵")).not.toBeInTheDocument();
    expect(screen.queryByText("概念检查")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "单维权重与损失切片探索" }),
    ).not.toBeInTheDocument();
  });

  it("puts the full derivative and weight-loss slice in the Stage 6 repair lab", async () => {
    stubLogisticRegressionFetch(
      makeProject({
        currentStage: 5,
        passedStages: [1, 2, 3, 4],
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/logistic-regression?classroom=1&stage=6", {
      auth: teacherAuthState,
    });
    await screen.findByRole("heading", { name: "逻辑回归 - 梯度维修台" });

    expect(screen.getByRole("heading", { name: "先预测这一步" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "修好学习引擎" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "为什么沿负梯度更新" })).toBeInTheDocument();
    expect(screen.getByText(/某一条短信的梯度方向可能与它不同/)).toBeInTheDocument();
    expect(document.querySelector(".sgd-editor .cm-editor")).not.toBeNull();
    expect(screen.getByLabelText("单条短信的更新代码")).toBeInTheDocument();
    expect(screen.getByLabelText("预测表达式").closest("label")).toHaveClass(
      "field-select",
      "field-select-native",
      "sgd-guide-field",
    );

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "代码编辑模式" })).getByRole("radio", {
        name: "自由手写",
      }),
    );
    flush();
    expect(screen.getByLabelText("单条短信的更新代码")).toBeInTheDocument();

    const appendixToggle = screen.getByRole("button", { name: "数学推导" });
    expect(appendixToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(appendixToggle);
    flush();
    expect(screen.getByText("从极大似然到最小化交叉熵")).toBeInTheDocument();
    expect(screen.getByText(/相乘时约掉这一项/)).toBeInTheDocument();
    const appendix = document.getElementById(appendixToggle.getAttribute("aria-controls")!)!;
    expect(appendix.querySelectorAll("math[display=block]")).toHaveLength(6);
    expect(appendix.querySelector("mfrac")).not.toBeNull();
    expect(appendix.querySelector(".katex-error")).toBeNull();
    expect(screen.getByText("链式法则如何化简权重梯度")).toBeInTheDocument();

    const slicePanel = screen.getByRole("region", { name: "单维权重与损失切片探索" });
    expect(within(slicePanel).getByText(/含「免费」样本：14 条/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/按 50% 门槛判对/)).toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: /往右试推一格/ }));
    flush();
    fireEvent.click(within(slicePanel).getByRole("button", { name: /← 往左试推一格/ }));
    flush();
    expect(within(slicePanel).getByText(/没有回到原位/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/坡度（偏导）不同/)).toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: "示例：步子太大跨过头" }));
    flush();
    expect(within(slicePanel).getByText(/含「好」样本：111 条/)).toBeInTheDocument();
    const stepBtn = within(slicePanel).getByRole("button", { name: "按梯度更新一步" });
    fireEvent.click(stepBtn);
    flush();
    fireEvent.click(stepBtn);
    flush();
    expect(within(slicePanel).getByText(/没有回到原位/)).toBeInTheDocument();

    fireEvent.click(
      within(within(slicePanel).getByRole("radiogroup", { name: "选择其余权重基准" })).getByRole(
        "radio",
        { name: "当前训练模型权重" },
      ),
    );
    flush();
    expect(within(slicePanel).getByText(/当前模型为「好」学到的权重/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/误拦正常/)).toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: "按梯度更新一步" }));
    flush();
    expect(within(slicePanel).getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: "重置起点" }));
    flush();
    expect(
      within(slicePanel).queryByRole("list", { name: /跳跃历史轨迹/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: "按梯度更新一步" }));
    flush();
    expect(within(slicePanel).getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();
    const handle = within(slicePanel).getByRole("slider", { name: /拖动调整词「好」的权重/ });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    flush();
    expect(
      within(slicePanel).queryByRole("list", { name: /跳跃历史轨迹/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps explicit stage=1 when opening ?classroom=1&stage=1 on an advanced project", async () => {
    stubLogisticRegressionFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/logistic-regression?classroom=1&stage=1", {
      auth: studentAuthState,
    });
    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });
    expect(screen.getByRole("button", { name: /用新短信试试模型/ })).toBeDisabled();
  });

  it("opens server currentStage when ?classroom=1 omits the stage query parameter", async () => {
    stubLogisticRegressionFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/logistic-regression?classroom=1", {
      auth: studentAuthState,
    });
    await screen.findByRole("heading", { name: "逻辑回归 - 训练模型" });
  });

  it.each([studentAuthState, teacherAuthState, adminAuthState])(
    "ignores old classroom links for every role",
    async (auth) => {
      stubLogisticRegressionFetch(makeProject(), () => json({}));
      await renderAppAt("/classes/c1/labs/logistic-regression?classroom=1&stage=4", { auth });
      await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });
      expect(screen.getByRole("button", { name: /训练模型/ })).toBeDisabled();
      expect(screen.queryByRole("button", { name: /课堂模式/ })).not.toBeInTheDocument();
    },
  );

  it("resets a student's chosen stage and opens its fresh workspace", async () => {
    const resets: unknown[] = [];
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/reset") && init?.method === "POST") {
        resets.push(JSON.parse(String(init.body)));
        return json(makeProject({ currentStage: 2, passedStages: [1] }));
      }
      if (url.includes("/project")) {
        return json(makeProject({ currentStage: 4, passedStages: [1, 2, 3] }));
      }
      if (url.includes("/api/labs")) {
        return json({ labs: [{ id: "logistic-regression", visible: true }] });
      }
      return json({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 训练模型" });

    fireEvent.click(screen.getByRole("button", { name: /从短信到数字/ }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: "重置进度" }));
    flush();
    expect(resets).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    flush();
    await waitFor(() => expect(screen.getByRole("button", { name: /训练模型/ })).toBeDisabled());
    expect(screen.getByRole("heading", { name: "逻辑回归 - 从短信到数字" })).toBeInTheDocument();
    expect(resets).toEqual([{ scope: "stage", stageIndex: 2, expectedGeneration: 0 }]);
  });

  it("drops a pre-reset in-flight judge verdict that resolves after reset", async () => {
    let resolveJudge!: (value: Response) => void;
    const judgePromise = new Promise<Response>((res) => {
      resolveJudge = res;
    });
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/judge") && init?.method === "POST") {
        return judgePromise;
      }
      if (url.includes("/reset") && init?.method === "POST") {
        return json(
          makeProject({
            currentStage: 1,
            passedStages: [],
            drafts: {},
          }) as LogisticRegressionProjectPayload & {
            projectGeneration: number;
          },
        );
      }
      if (url.includes("/project")) {
        return json(makeProject({ currentStage: 4, passedStages: [1, 2, 3] }));
      }
      if (url.includes("/api/labs")) {
        return json({ labs: [{ id: "logistic-regression", visible: true }] });
      }
      return json({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderAppAt("/classes/c1/labs/logistic-regression", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "逻辑回归 - 训练模型" });

    for (const prompt of LOGISTIC_REGRESSION_STAGES[3].prompts) {
      fireEvent.click(
        await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
      );
      flush();
    }
    fireEvent.click(screen.getByRole("button", { name: "提交第 4 关判定" }));
    flush();
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/judge"))).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "重置进度" }));
    flush();
    fireEvent.click(screen.getByRole("radio", { name: /重置整个实验/ }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    flush();
    await screen.findByRole("heading", { name: "逻辑回归 - 给 10 个词打分" });

    resolveJudge(
      json({
        passed: true,
        score: 5,
        total: 5,
        testSummary: { parts: [], detail: "stale" },
        submissionId: "sub-stale",
        currentStage: 5,
        passedStages: [1, 2, 3, 4],
      }),
    );
    await waitFor(() => expect(screen.queryByText("通过本关判定")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分" })).toBeInTheDocument();
  });
});
