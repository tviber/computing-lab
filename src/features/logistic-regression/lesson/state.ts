import type { SaveStatus } from "../../../shared/lab/contracts";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";
import {
  clamp,
  clampEpochs,
  clampEta,
  MAX_MANUAL_BIAS,
  MAX_MANUAL_WEIGHT,
  MIN_MANUAL_BIAS,
  MIN_MANUAL_WEIGHT,
} from "../domain/logisticRegression.ts";
import type {
  ConceptAnswers,
  LogisticRegressionDraft,
  LogisticRegressionJudgeResult,
  LogisticRegressionProjectExtras,
  LogisticRegressionTestSummary,
  ScoreDraft,
  StrategyDraft,
  TokenizeDraft,
  TrainDraft,
  SgdCodeDraft,
  TrainingSettings,
} from "../domain/protocol.ts";
import {
  getLogisticRegressionStage,
  logisticRegressionStageUnlocked,
  nextLogisticRegressionStage,
  SCORE_CALIBRATION_SMS,
  SCORE_WORDS,
  TOKENIZE_PRESETS,
  TOKENIZE_PUZZLE_ITEMS,
  type LogisticRegressionStageDef,
} from "../domain/stages.ts";
import { clampStrategyWeight, STRATEGY_WORDS } from "../domain/strategy.ts";
import type { RawTokenStatus } from "../domain/tokenizer.ts";
import { sanitizeSgdCodeDraft, SGD_STARTER_CODE } from "../domain/sgdCode.ts";

export type { SaveStatus };

const MAX_TEXT_CHARS = 240;

const VALID_STATUSES = new Set<RawTokenStatus>(["kept", "duplicate", "filtered", "oov"]);

function sanitizeConcepts(raw: unknown): ConceptAnswers {
  if (!raw || typeof raw !== "object") return {};
  const out: ConceptAnswers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10) {
      out[k] = v;
    }
  }
  return out;
}

export function defaultStrategyDraft(): StrategyDraft {
  const weights: Record<string, number> = {};
  for (const w of STRATEGY_WORDS) weights[w] = 0;
  return {
    weights,
    concepts: {},
  };
}

export function defaultTokenizeDraft(): TokenizeDraft {
  return {
    selectedPresetId: TOKENIZE_PRESETS[0].id,
    customText: TOKENIZE_PRESETS[0].text,
    classifications: {},
    concepts: {},
  };
}

export function defaultScoreDraft(): ScoreDraft {
  return {
    weights: {
      免费: 2,
      领取: 2,
      点击: 1.8,
      退订: 1.8,
      优惠: 1.8,
      同学: 0,
      明天: 0,
      一起: 0,
    },
    bias: 0.4,
    selectedMsgId: SCORE_CALIBRATION_SMS[0].id,
    concepts: {},
  };
}

export function defaultTrainDraft(): TrainDraft {
  return {
    eta: 0.01,
    epochs: 10,
    inspectEpoch: 10,
    showBgd: false,
  };
}

export function defaultSgdCodeDraft(): SgdCodeDraft {
  return { code: SGD_STARTER_CODE, concepts: {} };
}

export function sanitizeStrategyDraft(raw: unknown): StrategyDraft {
  const base = defaultStrategyDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const weights: Record<string, number> = { ...base.weights };
  if (obj.weights && typeof obj.weights === "object") {
    const rawW = obj.weights as Record<string, unknown>;
    for (const w of STRATEGY_WORDS) {
      const val = rawW[w];
      if (typeof val === "number" && Number.isFinite(val)) {
        weights[w] = clampStrategyWeight(val);
      }
    }
  }
  return {
    weights,
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function sanitizeTokenizeDraft(raw: unknown): TokenizeDraft {
  const base = defaultTokenizeDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const presetIds = new Set(TOKENIZE_PRESETS.map((p) => p.id));
  const selectedPresetId =
    typeof obj.selectedPresetId === "string" &&
    (presetIds.has(obj.selectedPresetId) || obj.selectedPresetId === "custom")
      ? obj.selectedPresetId
      : base.selectedPresetId;
  const customText =
    typeof obj.customText === "string" ? obj.customText.slice(0, MAX_TEXT_CHARS) : base.customText;
  const classifications: Record<string, RawTokenStatus> = {};
  if (obj.classifications && typeof obj.classifications === "object") {
    const allowedIds = new Set(TOKENIZE_PUZZLE_ITEMS.map((item) => item.id));
    for (const [k, v] of Object.entries(obj.classifications as Record<string, unknown>)) {
      if (allowedIds.has(k) && typeof v === "string" && VALID_STATUSES.has(v as RawTokenStatus)) {
        classifications[k] = v as RawTokenStatus;
      }
    }
  }
  return {
    selectedPresetId,
    customText,
    classifications,
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function sanitizeScoreDraft(raw: unknown): ScoreDraft {
  const base = defaultScoreDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const weights: Record<string, number> = { ...base.weights };
  if (obj.weights && typeof obj.weights === "object") {
    const rawW = obj.weights as Record<string, unknown>;
    for (const w of SCORE_WORDS) {
      const val = rawW[w];
      if (typeof val === "number" && Number.isFinite(val)) {
        weights[w] = Number(clamp(val, MIN_MANUAL_WEIGHT, MAX_MANUAL_WEIGHT).toFixed(2));
      }
    }
  }
  const bias =
    typeof obj.bias === "number" && Number.isFinite(obj.bias)
      ? Number(clamp(obj.bias, MIN_MANUAL_BIAS, MAX_MANUAL_BIAS).toFixed(2))
      : base.bias;
  const msgIds = new Set(SCORE_CALIBRATION_SMS.map((m) => m.id));
  const selectedMsgId =
    typeof obj.selectedMsgId === "string" && msgIds.has(obj.selectedMsgId)
      ? obj.selectedMsgId
      : base.selectedMsgId;
  return {
    weights,
    bias,
    selectedMsgId,
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function sanitizeTrainDraft(raw: unknown): TrainDraft {
  const base = defaultTrainDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const eta = typeof obj.eta === "number" ? clampEta(obj.eta) : base.eta;
  const epochs = typeof obj.epochs === "number" ? clampEpochs(obj.epochs) : base.epochs;
  const inspectEpochRaw =
    typeof obj.inspectEpoch === "number" && Number.isFinite(obj.inspectEpoch)
      ? Math.round(obj.inspectEpoch)
      : epochs;
  const inspectEpoch = Math.max(0, Math.min(epochs, inspectEpochRaw));
  const showBgd = typeof obj.showBgd === "boolean" ? obj.showBgd : base.showBgd;
  return {
    eta,
    epochs,
    inspectEpoch,
    showBgd,
  };
}

export function defaultDraftForStage(stageIndex: number): LogisticRegressionDraft {
  switch (stageIndex) {
    case 1:
      return defaultStrategyDraft();
    case 2:
      return defaultTokenizeDraft();
    case 3:
      return defaultScoreDraft();
    case 4:
      return defaultTrainDraft();
    case 6:
      return defaultSgdCodeDraft();
    default:
      return defaultStrategyDraft();
  }
}

export function sanitizeLogisticRegressionDraft(
  stageIndex: number,
  raw: unknown,
): LogisticRegressionDraft {
  switch (stageIndex) {
    case 1:
      return sanitizeStrategyDraft(raw);
    case 2:
      return sanitizeTokenizeDraft(raw);
    case 3:
      return sanitizeScoreDraft(raw);
    case 4:
      return sanitizeTrainDraft(raw);
    case 6: {
      return sanitizeSgdCodeDraft(raw);
    }
    default:
      return sanitizeStrategyDraft(raw);
  }
}

export type LogisticRegressionLessonState = {
  stageIndex: number;
  pinnedStage: number | null;
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, LogisticRegressionDraft>;
  conflictedLocalDrafts: Record<number, LogisticRegressionDraft>;
  draftRevisions: Record<number, number>;
  judgeOutcome: LogisticRegressionJudgeResult | null;
  runSummaries: LogisticRegressionProjectExtras["runSummaries"];
  trainedSettings?: TrainingSettings;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type LogisticRegressionLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, LogisticRegressionDraft>;
      draftRevisions?: Record<number, number>;
      runSummaries?: LogisticRegressionProjectExtras["runSummaries"];
      trainedSettings?: TrainingSettings;
      isReset?: boolean;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "update-stage1"; draft: StrategyDraft }
  | { type: "update-stage2"; draft: TokenizeDraft }
  | { type: "update-stage3"; draft: ScoreDraft }
  | { type: "update-stage4"; draft: TrainDraft }
  | { type: "update-stage6"; draft: SgdCodeDraft }
  | { type: "judge-result"; stageIndex: number; outcome: LogisticRegressionJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      draft?: LogisticRegressionDraft;
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

const EMPTY_SUMMARIES: LogisticRegressionProjectExtras["runSummaries"] = {
  s1: null,
  s2: null,
  s3: null,
  s4: null,
  s5: null,
  s6: null,
};

const SUMMARY_KEYS: Record<number, keyof LogisticRegressionProjectExtras["runSummaries"]> = {
  1: "s1",
  2: "s2",
  3: "s3",
  4: "s4",
  5: "s5",
  6: "s6",
};

export function createLogisticRegressionLessonState(
  initialStage: number | null = null,
): LogisticRegressionLessonState {
  const pinnedStage =
    initialStage !== null && getLogisticRegressionStage(initialStage) ? initialStage : null;
  return {
    stageIndex: 1,
    pinnedStage,
    currentStage: 1,
    passedStages: [],
    drafts: {
      1: defaultStrategyDraft(),
      2: defaultTokenizeDraft(),
      3: defaultScoreDraft(),
      4: defaultTrainDraft(),
      6: defaultSgdCodeDraft(),
    },
    conflictedLocalDrafts: {},
    draftRevisions: {},
    judgeOutcome: null,
    runSummaries: { ...EMPTY_SUMMARIES },
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

export function stageOf(
  state: LogisticRegressionLessonState,
): LogisticRegressionStageDef | undefined {
  return getLogisticRegressionStage(state.stageIndex);
}

export function isStageUnlocked(state: LogisticRegressionLessonState, stageIndex: number): boolean {
  return logisticRegressionStageUnlocked(state.passedStages, stageIndex);
}

export function draftOf(
  state: LogisticRegressionLessonState,
  stageIndex: number,
): LogisticRegressionDraft {
  return state.drafts[stageIndex] ?? defaultDraftForStage(stageIndex);
}

function withDraft(
  state: LogisticRegressionLessonState,
  stageIndex: number,
  nextDraft: LogisticRegressionDraft,
): LogisticRegressionLessonState {
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [stageIndex]: sanitizeLogisticRegressionDraft(stageIndex, nextDraft),
    },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, stageIndex, "dirty"),
    judgeOutcome: null,
  };
}

export function summaryForStage(
  state: LogisticRegressionLessonState,
  stageIndex: number,
  judgedStage: number | null,
): LogisticRegressionTestSummary | null {
  if (judgedStage === stageIndex && state.judgeOutcome) {
    return state.judgeOutcome.testSummary;
  }
  const key = SUMMARY_KEYS[stageIndex];
  return key ? state.runSummaries[key] : null;
}

export function transitionLogisticRegressionLesson(
  state: LogisticRegressionLessonState,
  action: LogisticRegressionLessonAction,
): LogisticRegressionLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        const index = Number(key);
        if ([1, 2, 3, 4, 6].includes(index)) draftRevisions[index] = rev;
      }
      const drafts: Record<number, LogisticRegressionDraft> = {
        1: defaultStrategyDraft(),
        2: defaultTokenizeDraft(),
        3: defaultScoreDraft(),
        4: defaultTrainDraft(),
        6: defaultSgdCodeDraft(),
      };
      for (const [key, draft] of Object.entries(action.drafts)) {
        const s = Number(key);
        if ([1, 2, 3, 4, 6].includes(s)) drafts[s] = sanitizeLogisticRegressionDraft(s, draft);
      }
      const pinnedStage = action.isReset ? null : state.pinnedStage;
      const serverStage = Math.min(action.currentStage, 5);
      const candidate = pinnedStage ?? serverStage;
      const stageIndex = logisticRegressionStageUnlocked(action.passedStages, candidate)
        ? candidate
        : Math.min(nextLogisticRegressionStage(action.passedStages), 5);
      return {
        ...state,
        pinnedStage,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        judgeOutcome: null,
        message: action.isReset ? null : state.message,
        runSummaries: action.runSummaries ?? { ...EMPTY_SUMMARIES },
        trainedSettings: action.trainedSettings,
      };
    }

    case "select-stage":
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return {
        ...state,
        stageIndex: action.stageIndex,
        pinnedStage: action.stageIndex,
        judgeOutcome: null,
      };

    case "update-stage1":
      return state.stageIndex === 1 ? withDraft(state, 1, action.draft) : state;
    case "update-stage2":
      return state.stageIndex === 2 ? withDraft(state, 2, action.draft) : state;
    case "update-stage3":
      return state.stageIndex === 3 ? withDraft(state, 3, action.draft) : state;
    case "update-stage4":
      return state.stageIndex === 4 ? withDraft(state, 4, action.draft) : state;
    case "update-stage6":
      return state.stageIndex === 6 ? withDraft(state, 6, action.draft) : state;

    case "judge-result": {
      const summaryKey = SUMMARY_KEYS[action.stageIndex];
      return {
        ...state,
        judgeOutcome: action.outcome,
        trainedSettings: action.outcome.trainedSettings ?? state.trainedSettings,
        passedStages: action.outcome.passedStages,
        currentStage: action.outcome.currentStage,
        runSummaries: summaryKey
          ? { ...state.runSummaries, [summaryKey]: action.outcome.testSummary }
          : state.runSummaries,
      };
    }

    case "mark-saving":
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
      };
    }
    case "mark-save-error":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };
    case "mark-save-sync-error": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "sync-error"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          true,
        ),
      };
    }
    case "resolve-save-conflict": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: sanitizeLogisticRegressionDraft(
            action.stageIndex,
            action.draft ?? {},
          ),
        },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
      };
    }
    case "restore-conflict-draft": {
      const backup = state.conflictedLocalDrafts[action.stageIndex];
      if (backup === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const isCurrent = action.stageIndex === state.stageIndex;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: backup },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        judgeOutcome: isCurrent ? null : state.judgeOutcome,
      };
    }
    case "discard-conflict-draft": {
      if (state.conflictedLocalDrafts[action.stageIndex] === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      return {
        ...state,
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage:
          status === "conflict"
            ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
            : state.saveStatusByStage,
      };
    }
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}
