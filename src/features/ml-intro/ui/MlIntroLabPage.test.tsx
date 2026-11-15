import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers.tsx";
import type { MlJudgeResult, MlProjectPayload } from "../domain/protocol.ts";
import { ML_STAGES, STAGE1_PUZZLE_ITEMS } from "../domain/stages.ts";
import type { RawTokenStatus } from "../domain/tokenizer.ts";

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
    runSummaries: { s1: null, s2: null, s3: null, s4: null, s5: null },
    ...overrides,
  };
}

const CHOICE_LABEL: Record<string, string> = {
  kept: "入表 (x=1)",
  duplicate: "重复忽略",
  filtered: "标点过滤",
  oov: "新词 OOV",
};

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

  it("renders stage 1 tokenizer workspace with stage 2 locked", async () => {
    stubMlFetch(makeProject(), () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: "把短信变成数字" });
    expect(screen.getByText(/训练词表总维数/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交第 1 关判定" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /给词打分与概率/ })).toBeDisabled();
  });

  it("completes stage 1 puzzle + concepts, passes judge, and unlocks stage 2", async () => {
    const passResult: MlJudgeResult = {
      passed: true,
      score: 10,
      total: 10,
      submissionId: "sub-1",
      currentStage: 2,
      passedStages: [1],
      testSummary: {
        parts: [
          { id: "tokens", label: "词元归类测验（7/7）", ok: true, detail: null },
          { id: "concepts", label: "概念检查（3/3）", ok: true, detail: null },
        ],
        detail: "7 个切词片段与概念题全部答对。",
      },
    };

    const fetchSpy = stubMlFetch(makeProject(), () => json(passResult));
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });

    await screen.findByRole("heading", { name: "把短信变成数字" });

    // Select classifications for all 7 puzzle items (two groups share label "免费").
    let freeSeen = 0;
    for (const item of STAGE1_PUZZLE_ITEMS) {
      const label = `片段 ${item.text} 的归类`;
      const group =
        item.text === "免费"
          ? screen.getAllByRole("group", { name: label })[freeSeen++]
          : screen.getByRole("group", { name: label });
      fireEvent.click(within(group).getByRole("button", { name: CHOICE_LABEL[item.expected] }));
    }

    // Answer all 3 progressive concept prompts for stage 1.
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

    const stage2Nav = screen.getByRole("button", { name: /给词打分与概率/ });
    expect(stage2Nav).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /进入下一关/ }));
    await screen.findByRole("heading", { name: "给词打分与概率" });
  });

  it("keeps stage 2 locked and displays verdict details on failed submission", async () => {
    const failResult: MlJudgeResult = {
      passed: false,
      score: 6,
      total: 10,
      submissionId: "sub-fail",
      currentStage: 1,
      passedStages: [],
      testSummary: {
        parts: [
          { id: "tokens", label: "词元归类测验（5/7）", ok: false, detail: "仍有 2 项归类有误" },
        ],
        detail: "请检查重复词与未见词（OOV）的区分。",
      },
    };

    stubMlFetch(makeProject(), () => json(failResult));
    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "把短信变成数字" });

    let freeSeen = 0;
    for (const item of STAGE1_PUZZLE_ITEMS) {
      const label = `片段 ${item.text} 的归类`;
      const group =
        item.text === "免费"
          ? screen.getAllByRole("group", { name: label })[freeSeen++]
          : screen.getByRole("group", { name: label });
      fireEvent.click(within(group).getByRole("button", { name: CHOICE_LABEL.kept }));
    }
    for (const prompt of ML_STAGES[0].prompts) {
      fireEvent.click(
        await screen.findByRole("button", { name: prompt.options[prompt.correct].label }),
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "提交第 1 关判定" }));

    await screen.findByText("尚未通过本关");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /给词打分与概率/ })).toBeDisabled(),
    );
  });

  it("matches Stage 4 validation list probabilities identically with MessageProbeCard explanation", async () => {
    const project = makeProject({
      currentStage: 4,
      passedStages: [1, 2, 3],
      drafts: {
        "4": {
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
    const prefilled: Record<string, RawTokenStatus> = {};
    for (const item of STAGE1_PUZZLE_ITEMS) {
      prefilled[item.id] = item.expected;
    }
    const project = makeProject({
      currentStage: 1,
      passedStages: [],
      drafts: {
        "1": {
          selectedPresetId: "promo",
          customText: "自定义测试短信：免费领取红包",
          classifications: prefilled,
          concepts: { "bag-of-words": 0 },
        },
      },
      draftRevisions: { "1": 3 },
    });
    const fetchSpy = stubMlFetch(project, () => json({}));

    await renderAppAt("/classes/c1/labs/ml-intro", { auth: teacherAuthState });
    await screen.findByRole("heading", { name: "把短信变成数字" });

    const input = screen.getByLabelText(/实验文本/) as HTMLInputElement;
    expect(input.value).toBe("自定义测试短信：免费领取红包");

    fireEvent.change(input, { target: { value: "更新后的短信文本" } });
    await waitFor(
      () =>
        expect(
          fetchSpy.mock.calls.some(([url, init]) => {
            const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
            if (!u.includes("/labs/ml-intro/draft") || init?.method !== "PUT") return false;
            const parsed = init.body ? JSON.parse(String(init.body)) : {};
            return parsed.stageIndex === 1 && parsed.draft?.customText === "更新后的短信文本";
          }),
        ).toBe(true),
      { timeout: 3000 },
    );
    await screen.findByText("已保存");
  });
});
