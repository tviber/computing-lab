import { seedFor } from "../domain/rng.ts";
import { generatePayload } from "../domain/payload.ts";
import { getDecodingStage } from "../domain/stages.ts";
import { createDecodingLessonState } from "../lesson/state.ts";
import { createDecodingViewModel } from "../controller/createViewModel.ts";
import type {
  DecodingLabActions,
  DecodingLabViewModel,
  DecodingRunResult,
} from "../controller/viewModel.ts";
import type { PixelMatrix } from "../domain/bmp.ts";
import type { DecodingJudgeResult } from "../domain/protocol.ts";

const PREVIEW_USER = "preview-student";

/** Public, synthetic data only. Never import server judge or real projects. */
function fixture(
  options: {
    stage?: number;
    fills?: Record<string, string>;
    conceptAnswers?: Record<string, number>;
    verdicts?: DecodingLabViewModel["verdicts"];
    running?: boolean;
    lastRun?: DecodingRunResult;
    runError?: string;
    preview?: PixelMatrix;
    samplePrintout?: string;
    samplePixels?: PixelMatrix;
    saveStatus?: "saving" | "error";
    loadError?: string;
    judgeFailed?: boolean;
    wrongPick?: { promptId: string; option: number };
  } = {},
): DecodingLabViewModel {
  const state = createDecodingLessonState(options.stage ?? 1);
  state.passedStages = Array.from({ length: state.stageIndex - 1 }, (_, i) => i + 1);
  state.saveStatusByStage = options.saveStatus ? { [state.stageIndex]: options.saveStatus } : {};
  const stage = getDecodingStage(state.stageIndex)!;
  // Deterministic payloads straight from the domain generator — same path
  // the server uses, so previews show real stage data.
  state.payloads = {
    [stage.index]: generatePayload(stage, seedFor(PREVIEW_USER, "decoding", stage.index)).payload,
  };
  state.drafts = {
    [stage.index]: {
      code: "",
      fills: options.fills ?? {},
      conceptAnswers: options.conceptAnswers ?? {},
      verdicts: options.verdicts ?? [],
    },
  };
  if (options.judgeFailed) {
    const outcome: DecodingJudgeResult = {
      passed: false,
      submissionId: "preview-synthetic",
      currentStage: stage.index,
      passedStages: state.passedStages,
      parts: [
        { id: "artifact", label: "解码产物比对", ok: false, detail: "第 1 个字符不符" },
        ...(stage.prompts ?? []).map((p) => ({
          id: `prompt-${p.id}`,
          label: `概念题：${p.prompt.slice(0, 12)}…`,
          ok: true,
          detail: null,
        })),
      ],
    };
    state.judgeOutcome = outcome;
  }
  return createDecodingViewModel({
    state,
    userId: PREVIEW_USER,
    running: options.running ?? false,
    lastRun: options.lastRun ?? null,
    runError: options.runError ?? null,
    preview: options.preview ?? null,
    sampleFills: stage.example?.blankDefaults ?? {},
    samplePrintout: options.samplePrintout ?? null,
    samplePixels: options.samplePixels ?? null,
    samplePrintError: null,
    sampleHover: null,
    wrongPick: options.wrongPick ?? null,
    submitting: false,
    loadError: options.loadError ?? null,
    submitError: null,
  });
}

const stageOneAnswers = { "what-is-encoding": 0 };

export const decodingPreviewFixtures = [
  { id: "initial", label: "初始状态", model: fixture() },
  {
    id: "incomplete-cloze",
    label: "填空未完 · 提交锁定",
    model: fixture({ conceptAnswers: stageOneAnswers }),
  },
  {
    id: "decoded",
    label: "已解码 · 可提交",
    model: fixture({
      fills: { "1": "chr(code)" },
      conceptAnswers: stageOneAnswers,
      lastRun: { text: "MOON" },
    }),
  },
  {
    id: "run-error",
    label: "运行报错",
    model: fixture({
      fills: { "1": "chr(" },
      conceptAnswers: stageOneAnswers,
      runError:
        "第 5 行附近语法写错了。检查括号、引号和冒号。（SyntaxError: invalid syntax (line 5)）",
    }),
  },
  {
    id: "bits-stage",
    label: "二进制密文",
    model: fixture({ stage: 2, fills: { "1": "chr(n)" }, lastRun: { text: "HI THERE" } }),
  },
  {
    id: "bmp-stage",
    label: "BMP 像素对比",
    model: fixture({ stage: 3, fills: { "1": "data[10]", "2": "2", "3": "reverse()" } }),
  },
  {
    id: "files-stage",
    label: "档案室 · 三个文件",
    model: fixture({ stage: 4, conceptAnswers: { "how-to-decide": 0 } }),
  },
  { id: "judge-failed", label: "判题失败", model: fixture({ judgeFailed: true }) },
  { id: "saving", label: "正在保存", model: fixture({ saveStatus: "saving" }) },
  { id: "save-error", label: "保存异常", model: fixture({ saveStatus: "error" }) },
  {
    id: "load-error",
    label: "加载异常",
    model: fixture({ loadError: "预览：草稿加载失败，请稍后重试。" }),
  },
  {
    id: "wrong-pick",
    label: "概念题答错",
    model: fixture({ wrongPick: { promptId: "what-is-encoding", option: 1 } }),
  },
] as const;

/** Fixed scenes record intents; they never start workers, fetch or save a draft. */
export function createDecodingPreviewActions(record: (action: string) => void): DecodingLabActions {
  return {
    selectStage: (index) => record(`selectStage(${index})`),
    dismissMessage: () => record("dismissMessage"),
    setFill: (id, value) => record(`setFill(${id}, ${value})`),
    setSampleFill: (id, value) => record(`setSampleFill(${id}, ${value})`),
    setSampleHover: () => record("setSampleHover"),
    run: () => record("run"),
    runPreview: () => record("runPreview"),
    printExample: () => record("printExample"),
    answerPrompt: (id, option) => record(`answerPrompt(${id}, ${option})`),
    setVerdict: (index) => record(`setVerdict(${index})`),
    submit: async () => record("submit"),
    restoreConflictLocal: () => record("restoreConflictLocal"),
    discardConflictLocal: () => record("discardConflictLocal"),
    retrySyncConflict: () => record("retrySyncConflict"),
  };
}
