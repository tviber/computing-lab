/**
 * Lesson reducer & strict boundary sanitization for ml-intro.
 * Pure state machine — zero React/network imports, mirrors computing-lab's
 * OCC save-status and conflict reconciliation semantics across all 5 stages.
 */

import type { SaveStatus } from "../../../shared/api/client";
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
  clampSampleSize,
  clampThreshold,
  MAX_MANUAL_BIAS,
  MAX_MANUAL_WEIGHT,
  MIN_MANUAL_BIAS,
  MIN_MANUAL_WEIGHT,
} from "../domain/logreg.ts";
import type {
  ConceptAnswers,
  EvaluateDraft,
  GeneralizeDraft,
  MlDraft,
  MlJudgeResult,
  MlProjectExtras,
  MlTestSummary,
  ScoreDraft,
  TokenizeDraft,
  TrainDraft,
} from "../domain/protocol.ts";
import {
  getMlStage,
  ML_STAGES,
  mlStageUnlocked,
  nextMlStage,
  STAGE1_PRESETS,
  STAGE1_PUZZLE_ITEMS,
  STAGE2_CALIBRATION_SMS,
  STAGE2_WORDS,
  type MlStageDef,
} from "../domain/stages.ts";
import type { RawTokenStatus } from "../domain/tokenizer.ts";

export type { SaveStatus };

const MAX_TEXT_CHARS = 240;

const VALID_STATUSES = new Set<RawTokenStatus>(["kept", "duplicate", "filtered", "oov"]);
const VALID_BUCKETS = new Set<"tp" | "fp" | "tn" | "fn">(["tp", "fp", "tn", "fn"]);

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

export function defaultTokenizeDraft(): TokenizeDraft {
  return {
    selectedPresetId: STAGE1_PRESETS[0].id,
    customText: STAGE1_PRESETS[0].text,
    classifications: {},
    concepts: {},
  };
}

export function defaultScoreDraft(): ScoreDraft {
  const weights: Record<string, number> = {};
  for (const w of STAGE2_WORDS) weights[w] = 0;
  return {
    weights,
    bias: -1,
    selectedMsgId: STAGE2_CALIBRATION_SMS[0].id,
    concepts: {},
  };
}

export function defaultTrainDraft(): TrainDraft {
  return {
    eta: 0.01,
    epochs: 10,
    inspectEpoch: 10,
    showBgd: true,
    concepts: {},
  };
}

export function defaultEvaluateDraft(): EvaluateDraft {
  return {
    eta: 0.1,
    epochs: 12,
    threshold: 0.85,
    activeBucket: "fn",
    concepts: {},
  };
}

export function defaultGeneralizeDraft(): GeneralizeDraft {
  return {
    sampleSize: 200,
    eta: 0.1,
    epochs: 15,
    threshold: 0.45,
    probeText: "免费领取现金红包，回复TD退订",
    concepts: {},
  };
}

export function sanitizeTokenizeDraft(raw: unknown): TokenizeDraft {
  const base = defaultTokenizeDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const presetIds = new Set(STAGE1_PRESETS.map((p) => p.id));
  const selectedPresetId =
    typeof obj.selectedPresetId === "string" &&
    (presetIds.has(obj.selectedPresetId) || obj.selectedPresetId === "custom")
      ? obj.selectedPresetId
      : base.selectedPresetId;
  const customText =
    typeof obj.customText === "string" ? obj.customText.slice(0, MAX_TEXT_CHARS) : base.customText;
  const classifications: Record<string, RawTokenStatus> = {};
  if (obj.classifications && typeof obj.classifications === "object") {
    const allowedIds = new Set(STAGE1_PUZZLE_ITEMS.map((item) => item.id));
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
    for (const w of STAGE2_WORDS) {
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
  const msgIds = new Set(STAGE2_CALIBRATION_SMS.map((m) => m.id));
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
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function sanitizeEvaluateDraft(raw: unknown): EvaluateDraft {
  const base = defaultEvaluateDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const eta = typeof obj.eta === "number" ? clampEta(obj.eta) : base.eta;
  const epochs = typeof obj.epochs === "number" ? clampEpochs(obj.epochs) : base.epochs;
  const threshold =
    typeof obj.threshold === "number" ? clampThreshold(obj.threshold) : base.threshold;
  const activeBucket =
    typeof obj.activeBucket === "string" &&
    VALID_BUCKETS.has(obj.activeBucket as "tp" | "fp" | "tn" | "fn")
      ? (obj.activeBucket as "tp" | "fp" | "tn" | "fn")
      : base.activeBucket;
  return {
    eta,
    epochs,
    threshold,
    activeBucket,
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function sanitizeGeneralizeDraft(raw: unknown): GeneralizeDraft {
  const base = defaultGeneralizeDraft();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const sampleSize =
    typeof obj.sampleSize === "number" ? clampSampleSize(obj.sampleSize) : base.sampleSize;
  const eta = typeof obj.eta === "number" ? clampEta(obj.eta) : base.eta;
  const epochs = typeof obj.epochs === "number" ? clampEpochs(obj.epochs) : base.epochs;
  const threshold =
    typeof obj.threshold === "number" ? clampThreshold(obj.threshold) : base.threshold;
  const probeText =
    typeof obj.probeText === "string" ? obj.probeText.slice(0, MAX_TEXT_CHARS) : base.probeText;
  return {
    sampleSize,
    eta,
    epochs,
    threshold,
    probeText,
    concepts: sanitizeConcepts(obj.concepts),
  };
}

export function defaultDraftForStage(stageIndex: number): MlDraft {
  switch (stageIndex) {
    case 1:
      return defaultTokenizeDraft();
    case 2:
      return defaultScoreDraft();
    case 3:
      return defaultTrainDraft();
    case 4:
      return defaultEvaluateDraft();
    case 5:
      return defaultGeneralizeDraft();
    default:
      return defaultTokenizeDraft();
  }
}

export function sanitizeMlDraft(stageIndex: number, raw: unknown): MlDraft {
  switch (stageIndex) {
    case 1:
      return sanitizeTokenizeDraft(raw);
    case 2:
      return sanitizeScoreDraft(raw);
    case 3:
      return sanitizeTrainDraft(raw);
    case 4:
      return sanitizeEvaluateDraft(raw);
    case 5:
      return sanitizeGeneralizeDraft(raw);
    default:
      return sanitizeTokenizeDraft(raw);
  }
}

export type MlLessonState = {
  stageIndex: number;
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, MlDraft>;
  conflictedLocalDrafts: Record<number, MlDraft>;
  draftRevisions: Record<number, number>;
  judgeOutcome: MlJudgeResult | null;
  runSummaries: MlProjectExtras["runSummaries"];
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type MlLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, MlDraft>;
      draftRevisions?: Record<number, number>;
      runSummaries?: MlProjectExtras["runSummaries"];
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "update-stage1"; draft: TokenizeDraft }
  | { type: "update-stage2"; draft: ScoreDraft }
  | { type: "update-stage3"; draft: TrainDraft }
  | { type: "update-stage4"; draft: EvaluateDraft }
  | { type: "update-stage5"; draft: GeneralizeDraft }
  | { type: "judge-result"; stageIndex: number; outcome: MlJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | { type: "resolve-save-conflict"; stageIndex: number; draft?: MlDraft; revision?: number }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

const EMPTY_SUMMARIES: MlProjectExtras["runSummaries"] = {
  s1: null,
  s2: null,
  s3: null,
  s4: null,
  s5: null,
};

const SUMMARY_KEYS: Record<number, keyof MlProjectExtras["runSummaries"]> = {
  1: "s1",
  2: "s2",
  3: "s3",
  4: "s4",
  5: "s5",
};

export function createMlLessonState(initialStage = 1): MlLessonState {
  const stageIndex = getMlStage(initialStage) ? initialStage : 1;
  return {
    stageIndex,
    currentStage: 1,
    passedStages: [],
    drafts: {
      1: defaultTokenizeDraft(),
      2: defaultScoreDraft(),
      3: defaultTrainDraft(),
      4: defaultEvaluateDraft(),
      5: defaultGeneralizeDraft(),
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

export function stageOf(state: MlLessonState): MlStageDef | undefined {
  return getMlStage(state.stageIndex);
}

export function isStageUnlocked(state: MlLessonState, stageIndex: number): boolean {
  return mlStageUnlocked(state.passedStages, stageIndex);
}

export function draftOf(state: MlLessonState, stageIndex: number): MlDraft {
  return state.drafts[stageIndex] ?? defaultDraftForStage(stageIndex);
}

function withDraft(state: MlLessonState, stageIndex: number, nextDraft: MlDraft): MlLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [stageIndex]: sanitizeMlDraft(stageIndex, nextDraft) },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, stageIndex, "dirty"),
    judgeOutcome: null,
  };
}

export function summaryForStage(
  state: MlLessonState,
  stageIndex: number,
  judgedStage: number | null,
): MlTestSummary | null {
  if (judgedStage === stageIndex && state.judgeOutcome) {
    return state.judgeOutcome.testSummary;
  }
  const key = SUMMARY_KEYS[stageIndex];
  return key ? state.runSummaries[key] : null;
}

export function transitionMlLesson(state: MlLessonState, action: MlLessonAction): MlLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      const drafts: Record<number, MlDraft> = {
        1: defaultTokenizeDraft(),
        2: defaultScoreDraft(),
        3: defaultTrainDraft(),
        4: defaultEvaluateDraft(),
        5: defaultGeneralizeDraft(),
      };
      for (const [key, draft] of Object.entries(action.drafts)) {
        const s = Number(key);
        if (getMlStage(s)) drafts[s] = sanitizeMlDraft(s, draft);
      }
      const candidate = mlStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : mlStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      const stageIndex = getMlStage(candidate) ? candidate : ML_STAGES.length;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        judgeOutcome: null,
        runSummaries: action.runSummaries ?? { ...EMPTY_SUMMARIES },
      };
    }

    case "select-stage":
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };

    case "update-stage1":
      return state.stageIndex === 1 ? withDraft(state, 1, action.draft) : state;
    case "update-stage2":
      return state.stageIndex === 2 ? withDraft(state, 2, action.draft) : state;
    case "update-stage3":
      return state.stageIndex === 3 ? withDraft(state, 3, action.draft) : state;
    case "update-stage4":
      return state.stageIndex === 4 ? withDraft(state, 4, action.draft) : state;
    case "update-stage5":
      return state.stageIndex === 5 ? withDraft(state, 5, action.draft) : state;

    case "judge-result": {
      const summaryKey = SUMMARY_KEYS[action.stageIndex];
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextMlStage(action.outcome.passedStages),
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
          [action.stageIndex]: sanitizeMlDraft(action.stageIndex, action.draft ?? {}),
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
