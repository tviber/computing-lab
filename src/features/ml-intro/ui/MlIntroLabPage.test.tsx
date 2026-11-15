import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers.tsx";
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

  it("renders stage 1 10-word strategy workspace with stage 2 locked", async () => {
    stubMlFetch(makeProject(), () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: "直觉策略：给 10 个词打分" });
    for (const word of STRATEGY_WORDS) {
      expect(screen.getByLabelText(`${word} 权重滑块`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${word} 权重数值`)).toBeInTheDocument();
    }
    expect(screen.getByText(/点积拆解（10 维向量 × 你的权重）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交第 1 关判定" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /把短信变成数字/ })).toBeDisabled();
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

    await screen.findByRole("heading", { name: "直觉策略：给 10 个词打分" });

    // Adjust spam and normal weights via slider and number inputs.
    fireEvent.change(screen.getByLabelText("中奖 权重滑块"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("发票 权重数值"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("退款 权重数值"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("优惠 权重数值"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("妈妈 权重滑块"), { target: { value: "-3" } });
    fireEvent.change(screen.getByLabelText("开会 权重数值"), { target: { value: "-2" } });
    fireEvent.change(screen.getByLabelText("老师 权重数值"), { target: { value: "-2" } });

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
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "直觉策略：给 10 个词打分" });

    fireEvent.change(screen.getByLabelText("中奖 权重数值"), { target: { value: "2" } });
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
    await screen.findByRole("heading", { name: "别被高分假象骗了" });

    for (const bucketLabel of [/FN · 漏网之鱼/, /FP · 误杀好人/, /TP · 正确拦截/]) {
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
          weights: { 中奖: 2.5, 妈妈: -3 },
          selectedMsgId: "st-ham-1",
          concepts: { "dot-product-strategy": 1 },
        },
      },
      draftRevisions: { "1": 3 },
    });
    const fetchSpy = stubMlFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "直觉策略：给 10 个词打分" });

    const numInput = screen.getByLabelText("中奖 权重数值") as HTMLInputElement;
    expect(numInput.value).toBe("2.5");

    fireEvent.change(numInput, { target: { value: "4" } });
    await waitFor(
      () =>
        expect(
          fetchSpy.mock.calls.some(([url, init]) => {
            const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
            if (!u.includes("/labs/ml-intro/draft") || init?.method !== "PUT") return false;
            const parsed = init.body ? JSON.parse(String(init.body)) : {};
            return parsed.stageIndex === 1 && parsed.draft?.weights?.["中奖"] === 4;
          }),
        ).toBe(true),
      { timeout: 3000 },
    );
    await screen.findByText("已保存");
  });
});
