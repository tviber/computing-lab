import type {
  LikelihoodDraft,
  LinearRegressionDraft,
  SigmoidBridgeDraft,
  StatsFoundationsDraft,
} from "./protocol.ts";
import {
  clamp,
  COIN_P_MAX,
  COIN_P_MIN,
  LINEAR_INTERCEPT_MAX,
  LINEAR_INTERCEPT_MIN,
  LINEAR_SLOPE_MAX,
  LINEAR_SLOPE_MIN,
  SIGMOID_B_MAX,
  SIGMOID_B_MIN,
  SIGMOID_W_MAX,
  SIGMOID_W_MIN,
} from "./statsMath.ts";

function defaultLinearRegressionDraft(): LinearRegressionDraft {
  return {
    slope: 1.5,
    intercept: 10,
    showSquares: true,
    answer: null,
  };
}

function defaultLikelihoodDraft(): LikelihoodDraft {
  return {
    p: 0.5,
    viewMode: "likelihood",
    answer: null,
  };
}

function defaultSigmoidBridgeDraft(): SigmoidBridgeDraft {
  return {
    w: 0.8,
    b: -2.0,
    curveMode: "linear",
  };
}

function sanitizeAnswer(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < 3 ? raw : null;
}

function sanitizePercentString(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, 10);
}

export function sanitizeStatsFoundationsDraft(
  stageIndex: number,
  raw: unknown,
): StatsFoundationsDraft {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (stageIndex === 1) {
    const def = defaultLinearRegressionDraft();
    return {
      slope:
        typeof obj.slope === "number"
          ? clamp(obj.slope, LINEAR_SLOPE_MIN, LINEAR_SLOPE_MAX)
          : def.slope,
      intercept:
        typeof obj.intercept === "number"
          ? clamp(obj.intercept, LINEAR_INTERCEPT_MIN, LINEAR_INTERCEPT_MAX)
          : def.intercept,
      showSquares: typeof obj.showSquares === "boolean" ? obj.showSquares : def.showSquares,
      answer: sanitizeAnswer(obj.answer),
    };
  }
  if (stageIndex === 2) {
    return {
      pRain: sanitizePercentString(obj.pRain),
      pRainGivenForecast: sanitizePercentString(obj.pRainGivenForecast),
      pForecastGivenRain: sanitizePercentString(obj.pForecastGivenRain),
      answer: sanitizeAnswer(obj.answer),
    };
  }
  if (stageIndex === 3) {
    const def = defaultLikelihoodDraft();
    return {
      p: typeof obj.p === "number" ? clamp(obj.p, COIN_P_MIN, COIN_P_MAX) : def.p,
      viewMode: obj.viewMode === "nll" ? "nll" : "likelihood",
      answer: sanitizeAnswer(obj.answer),
    };
  }
  const def = defaultSigmoidBridgeDraft();
  return {
    w: typeof obj.w === "number" ? clamp(obj.w, SIGMOID_W_MIN, SIGMOID_W_MAX) : def.w,
    b: typeof obj.b === "number" ? clamp(obj.b, SIGMOID_B_MIN, SIGMOID_B_MAX) : def.b,
    curveMode: obj.curveMode === "sigmoid" ? "sigmoid" : "linear",
  };
}

export function defaultDraftForStage(stageIndex: number): StatsFoundationsDraft {
  return sanitizeStatsFoundationsDraft(stageIndex, {});
}
