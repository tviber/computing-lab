import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminAuthState,
  renderAppAt,
  studentAuthState,
  teacherAuthState,
} from "../../../test/router-test-helpers.tsx";
import type { MlJudgeResult, MlProjectPayload } from "../domain/protocol.ts";
import { ML_STAGES } from "../domain/stages.ts";
import { STRATEGY_WORDS } from "../domain/strategy.ts";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeProject(overrides: Partial<MlProjectPayload> = {}): MlProjectPayload {
  return {
    currentStage: 1,
    passedStages: [],
    drafts: {},
    draftRevisions: {},
    runSummaries: { s1: null, s2: null, s3: null, s4: null, s5: null, s6: null },
    ...overrides,
  };
}

function stubMlFetch(
  project: MlProjectPayload,
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
      return json({ labs: [{ id: "ml-intro", visible: true }] });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("MlIntroLabPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders stage 1 10-word strategy workspace with stage 2 locked for students", async () => {
    stubMlFetch(makeProject(), () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: studentAuthState });

    await screen.findByRole("heading", { name: "给 10 个词打分" });
    await screen.findByRole("group", { name: "中奖 倾向设置" });
    for (const word of STRATEGY_WORDS) {
      expect(screen.getByRole("group", { name: `${word} 倾向设置` })).toBeInTheDocument();
    }
    expect(screen.getByText(/这条短信的总分怎么算/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交第 1 关判定" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /把短信变成数字/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "重置我的进度" })).not.toBeInTheDocument();
  });

  it("shows concrete precision and recall fractions for the current validation results", async () => {
    stubMlFetch(
      makeProject({
        currentStage: 5,
        passedStages: [1, 2, 3, 4],
        drafts: { 5: { threshold: 0.4, eta: 0.1, epochs: 12, activeBucket: "fp", concepts: {} } },
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "检查模型分错了什么" });

    expect(screen.getByText(/正确拦截 \d+ ÷ 全部拦截 \d+ 条/)).toBeInTheDocument();
    expect(screen.getByText(/正确拦截 \d+ ÷ 全部垃圾短信 \d+ 条/)).toBeInTheDocument();
  });

  it("explains the data splits and distinguishes replay from model training", async () => {
    stubMlFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
        drafts: { 4: { eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false, concepts: {} } },
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "让模型调整权重" });

    expect(screen.getByText(/训练集的 1,400 条短信用于更新权重/)).toBeInTheDocument();
    expect(screen.getByText(/SGD 每条后更新一次，共 1,400 次；BGD/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/回放第/), { target: { value: "0" } });
    expect(screen.getByText(/第 0 轮是训练前的权重/)).toBeInTheDocument();
    expect(screen.getByText(/下面只回放已有结果，不改变最终提交的模型/)).toBeInTheDocument();
  });

  it("moves mobile learners to the selected explanation and back to the same message", async () => {
    stubMlFetch(makeProject({ currentStage: 5, passedStages: [1, 2, 3, 4] }), () => json({}));
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "检查模型分错了什么" });
    const details = screen.getByRole("region", { name: "所选短信的评分依据" });
    const scrollDetails = vi.fn();
    details.scrollIntoView = scrollDetails;
    expect(scrollDetails).not.toHaveBeenCalled();
    const messages = document.querySelectorAll<HTMLButtonElement>(".ml-case-btn");
    expect(messages.length).toBeGreaterThan(1);
    const selected = messages[1];
    selected.scrollIntoView = vi.fn();
    fireEvent.click(selected);
    await waitFor(() => expect(scrollDetails).toHaveBeenCalled());
    expect(details).toHaveFocus();
    expect(selected).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "返回短信列表", hidden: true }));
    expect(selected).toHaveFocus();
  });

  it("completes stage 1 weights + concepts, passes judge, and unlocks stage 2", async () => {
    const passResult: MlJudgeResult = {
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

    const fetchSpy = stubMlFetch(makeProject(), () => json(passResult));
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: "给 10 个词打分" });
    await screen.findByRole("group", { name: "中奖 倾向设置" });

    // Click discrete polarity tiers for spam and normal words.
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
      const group = screen.getByRole("group", { name: `${word} 倾向设置` });
      fireEvent.click(within(group).getByRole("button", { name: tierLabel }));
    }

    expect(screen.getByText("判对 6 / 6")).toBeInTheDocument();

    // Answer all progressive concept prompts for stage 1.
    for (const prompt of ML_STAGES[0].prompts) {
      const btn = await screen.findByRole("button", { name: prompt.options[prompt.correct].label });
      fireEvent.click(btn);
    }

    const submitBtn = screen.getByRole("button", { name: "提交第 1 关判定" });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await screen.findByText("通过本关判定");
    expect(screen.getByText(/本关收获/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/classes/c1/labs/ml-intro/judge"),
      expect.objectContaining({ method: "POST" }),
    );

    const stage2Nav = screen.getByRole("button", { name: /把短信变成数字/ });
    expect(stage2Nav).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /进入下一关/ }));
    await screen.findByRole("heading", { name: "把短信变成数字" });
  });

  it("keeps stage 2 locked and displays verdict details on failed submission", async () => {
    const failResult: MlJudgeResult = {
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

    stubMlFetch(makeProject(), () => json(failResult));
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "给 10 个词打分" });

    fireEvent.click(
      within(await screen.findByRole("group", { name: "中奖 倾向设置" })).getByRole("button", {
        name: "+2 强垃圾",
      }),
    );
    for (const prompt of ML_STAGES[0].prompts) {
      fireEvent.click(
        await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "提交第 1 关判定" }));

    await screen.findByText("尚未通过本关");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /把短信变成数字/ })).toBeDisabled(),
    );
  });

  it("matches Stage 5 validation list probabilities identically with MessageProbeCard explanation", async () => {
    const project = makeProject({
      currentStage: 5,
      passedStages: [1, 2, 3, 4],
      drafts: {
        "5": {
          eta: 0.1,
          epochs: 12,
          threshold: 0.5,
          activeBucket: "fn",
          concepts: {},
        },
      },
    });
    stubMlFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "检查模型分错了什么" });

    for (const bucketLabel of [/FN · 漏掉垃圾短信/, /FP · 误拦正常短信/, /TP · 正确拦截/]) {
      fireEvent.click(screen.getByRole("button", { name: bucketLabel }));
      const caseButtons = document.querySelectorAll(".ml-case-btn");
      if (caseButtons.length === 0) continue;
      for (const btn of Array.from(caseButtons).slice(0, 3)) {
        fireEvent.click(btn);
        const probText = btn.querySelector(".ml-case-prob")?.textContent?.trim();
        expect(probText).toBeTruthy();
        expect(screen.getByText(new RegExp(`模型判定：.*（${probText}）`))).toBeInTheDocument();
      }
    }
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
    const fetchSpy = stubMlFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "给 10 个词打分" });

    const prizeGroup = await screen.findByRole("group", { name: "中奖 倾向设置" });
    expect(within(prizeGroup).getByRole("button", { name: "+1 偏垃圾" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const momGroup = screen.getByRole("group", { name: "妈妈 倾向设置" });
    expect(within(momGroup).getByRole("button", { name: "−2 强正常" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(prizeGroup).getByRole("button", { name: "+2 强垃圾" }));
    await waitFor(
      () =>
        expect(
          fetchSpy.mock.calls.some(([url, init]) => {
            const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
            if (!u.includes("/labs/ml-intro/draft") || init?.method !== "PUT") return false;
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
    stubMlFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "把分数换成概率" });

    const chart = screen.getByLabelText("Sigmoid 曲线与当前模型定位");
    expect(chart).toBeInTheDocument();
    // 1 bias diamond + 6 message circles
    expect(chart.querySelectorAll("circle").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(/没有已知词时的垃圾概率：59\.9%/)).toBeInTheDocument();

    // Clicking another SMS dot on the Sigmoid curve updates the selected message breakdown.
    const hamDotTitle = within(chart as unknown as HTMLElement).getByText(/含「免费」的正常短信/);
    fireEvent.click(hamDotTitle.closest("g")!);
    expect(screen.getByText(/当前选中的短信拆解：含「免费」的正常短信/)).toBeInTheDocument();
  });

  it("renders Stage 4 role-focused visuals, single math appendix toggle, and plain-language 1D slice", async () => {
    stubMlFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
        drafts: { 4: { eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false, concepts: {} } },
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "让模型调整权重" });

    // Role cards & single-step penalty curve are immediately visible while math appendix starts collapsed.
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
    expect(screen.getByText(/损失（Loss）= 猜错扣分表/)).toBeInTheDocument();
    expect(screen.getByText(/斜率 \/ 梯度 = 调参指南针/)).toBeInTheDocument();
    expect(screen.getByLabelText("预测概率与猜错扣分曲线")).toBeInTheDocument();
    expect(screen.getByText(/这次会怎么推权重？/)).toBeInTheDocument();

    const appendixToggle = screen.getByRole("button", { name: /查看背后的数学推导/ });
    expect(appendixToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/合并两种标签的猜对概率/)).not.toBeInTheDocument();

    fireEvent.click(appendixToggle);
    expect(appendixToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/合并两种标签的猜对概率/)).toBeInTheDocument();
    expect(screen.getByText(/上下约去 p/)).toBeInTheDocument();
    expect(screen.getByText(/SGD（每次读 1 条就更新）/)).toBeInTheDocument();
    expect(screen.getByText(/整批平均损失 L 的梯度（BGD）/)).toBeInTheDocument();

    // Advanced 1D weight-loss slice explorer starts collapsed by default.
    const advancedToggle = screen.getByRole("button", { name: /展开进阶探索：单维权重切片图/ });
    expect(advancedToggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "单维权重与损失切片探索" }),
    ).not.toBeInTheDocument();

    fireEvent.click(advancedToggle);
    expect(advancedToggle).toHaveAttribute("aria-expanded", "true");

    // 1D slice explorer shows real-SMS classification impact and asymmetric stepped jumps.
    const slicePanel = screen.getByRole("region", { name: "单维权重与损失切片探索" });
    expect(within(slicePanel).getByText(/含「免费」样本：14 条/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/按 50% 门槛判对/)).toBeInTheDocument();

    fireEvent.click(within(slicePanel).getByRole("button", { name: /往右试推一格/ }));
    fireEvent.click(within(slicePanel).getByRole("button", { name: /← 往左试推一格/ }));
    expect(within(slicePanel).getByText(/没有回到原位/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/坡度（偏导）不同/)).toBeInTheDocument();

    // Overshoot bounce demo preset + two gradient descent steps.
    fireEvent.click(within(slicePanel).getByRole("button", { name: "示例：步子太大跨过头" }));
    expect(within(slicePanel).getByText(/含「好」样本：111 条/)).toBeInTheDocument();
    const stepBtn = within(slicePanel).getByRole("button", { name: /顺坡走一步/ });
    fireEvent.click(stepBtn);
    fireEvent.click(stepBtn);
    expect(within(slicePanel).getByText(/没有回到原位/)).toBeInTheDocument();

    // Switching context mode to trained model checks proximity honestly rather than unconditionally claiming valley.
    fireEvent.click(within(slicePanel).getByRole("button", { name: "当前训练模型权重" }));
    expect(within(slicePanel).getByText(/当前模型为「好」学到的权重/)).toBeInTheDocument();
    expect(within(slicePanel).getByText(/误拦正常/)).toBeInTheDocument();

    // Build a multi-step trajectory in trained mode, then change training eta: stale trail must reset.
    fireEvent.click(within(slicePanel).getByRole("button", { name: /顺坡走一步/ }));
    expect(within(slicePanel).getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();

    // Under-trained eta = 0.002 warns that learned weight has not reached w* and resets stale model trail.
    fireEvent.click(screen.getByRole("button", { name: "较小 η = 0.002" }));
    await waitFor(() => expect(within(slicePanel).getByText(/仍有差距/)).toBeInTheDocument());
    expect(
      within(slicePanel).queryByRole("list", { name: /跳跃历史轨迹/ }),
    ).not.toBeInTheDocument();

    // Step again, then verify keyboard slider adjustment updates position and clears trail.
    fireEvent.click(within(slicePanel).getByRole("button", { name: /顺坡走一步/ }));
    expect(within(slicePanel).getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();
    const handle = within(slicePanel).getByRole("slider", { name: /拖动调整词「好」的权重/ });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(
      within(slicePanel).queryByRole("list", { name: /跳跃历史轨迹/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps explicit stage=1 when opening ?classroom=1&stage=1 on an advanced project", async () => {
    stubMlFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro?classroom=1&stage=1", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "给 10 个词打分" });
    expect(screen.getByText(/课堂自由跳关：已开启/)).toBeInTheDocument();
  });

  it("opens server currentStage when ?classroom=1 omits the stage query parameter", async () => {
    stubMlFetch(
      makeProject({
        currentStage: 4,
        passedStages: [1, 2, 3],
      }),
      () => json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro?classroom=1", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "让模型调整权重" });
  });

  it("allows student classroom free-navigation preview across stages while guarding formal judge submission", async () => {
    const fetchSpy = stubMlFetch(makeProject({ currentStage: 1, passedStages: [] }), () =>
      json({}),
    );

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: studentAuthState });
    await screen.findByRole("heading", { name: "给 10 个词打分" });

    expect(screen.getByRole("button", { name: /让模型调整权重/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "课堂模式：先看后面关卡" }));
    const stage4Btn = screen.getByRole("button", { name: /让模型调整权重/ });
    expect(stage4Btn).toBeEnabled();
    fireEvent.click(stage4Btn);

    await screen.findByRole("heading", { name: "让模型调整权重" });
    expect(screen.getByText(/当前为「课堂自由跳关」预览模式/)).toBeInTheDocument();

    // Answer Stage 4 concepts and attempt formal submit while Stage 1-3 remain unpassed.
    for (const prompt of ML_STAGES[3].prompts) {
      fireEvent.click(
        await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "提交第 4 关判定" }));
    expect(screen.getByText(/如需正式提交过关记录，请先通过前面的关卡/)).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/judge"))).toBe(false);
  });

  it("grants teacher and admin immediate free navigation across stages without classroom toggle", async () => {
    for (const auth of [teacherAuthState, adminAuthState]) {
      const fetchSpy = stubMlFetch(makeProject({ currentStage: 1, passedStages: [] }), () =>
        json({
          passed: true,
          score: 5,
          total: 5,
          testSummary: { parts: [], detail: "ok" },
          submissionId: "sub-4",
          currentStage: 5,
          passedStages: [4],
        }),
      );

      const rendered = await renderAppAt("/classes/c1/labs/ml-intro", { auth });
      await screen.findByRole("heading", { name: "给 10 个词打分" });

      expect(screen.getByText("教师视角 · 自由切关")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重置我的进度" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "课堂模式：先看后面关卡" })).toBeNull();

      const stage4Btn = screen.getByRole("button", { name: /让模型调整权重/ });
      expect(stage4Btn).toBeEnabled();
      fireEvent.click(stage4Btn);

      await screen.findByRole("heading", { name: "让模型调整权重" });
      for (const prompt of ML_STAGES[3].prompts) {
        fireEvent.click(
          await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "提交第 4 关判定" }));
      await waitFor(() =>
        expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/judge"))).toBe(true),
      );
      rendered.unmount();
    }
  });

  it("prompts for confirmation and resets staff own progress via POST /reset", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    let resetCalls = 0;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/reset") && init?.method === "POST") {
        resetCalls += 1;
        return json(makeProject({ currentStage: 1, passedStages: [], drafts: {} }));
      }
      if (url.includes("/project")) {
        return json(makeProject({ currentStage: 4, passedStages: [1, 2, 3] }));
      }
      if (url.includes("/api/labs")) {
        return json({ labs: [{ id: "ml-intro", visible: true }] });
      }
      return json({});
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "让模型调整权重" });

    fireEvent.click(screen.getByRole("button", { name: "重置我的进度" }));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(resetCalls).toBe(0);

    confirmMock.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "重置我的进度" }));
    await screen.findByRole("heading", { name: "给 10 个词打分" });
    expect(resetCalls).toBe(1);
  });
});
