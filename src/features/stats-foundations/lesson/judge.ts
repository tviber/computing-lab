import type {
  ConditionalProbDraft,
  LikelihoodDraft,
  LinearRegressionDraft,
  SigmoidBridgeDraft,
  StatsFoundationsDraft,
  StatsFoundationsTestSummary,
} from "../domain/protocol.ts";
import { getStatsFoundationsStage } from "../domain/stages.ts";
import {
  evaluateLinearFit,
  evaluateSigmoidFit,
  isNearCoinMLE,
  LINEAR_MSE_THRESHOLD,
  roundTo,
  SIGMOID_ACCURACY_THRESHOLD,
  SIGMOID_LOGLOSS_THRESHOLD,
  WEATHER_EXPECTED,
} from "../domain/statsMath.ts";

function parsePercentInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/%$/, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function evaluateStatsStage(
  stageIndex: number,
  draft: StatsFoundationsDraft,
): { passed: boolean; feedback: string; summary: StatsFoundationsTestSummary } {
  const stage = getStatsFoundationsStage(stageIndex)!;

  if (stageIndex === 1) {
    const d = draft as LinearRegressionDraft;
    const fit = evaluateLinearFit(d.slope, d.intercept);
    const mseOk = fit.mse <= LINEAR_MSE_THRESHOLD;
    const qOk = stage.question ? d.answer === stage.question.correct : true;
    const passed = mseOk && qOk;
    let feedback: string;
    if (!mseOk) {
      feedback = `当前均方误差 MSE = ${roundTo(fit.mse, 2)}，还需要降到 ${LINEAR_MSE_THRESHOLD} 以下。试着让直线穿过散点的中部，再继续微调斜率与截距。`;
    } else if (!qOk) {
      feedback = `直线拟合已经达到目标（MSE = ${roundTo(fit.mse, 2)}）。下方的直觉小问答还没选对，再想想正负残差直接相加会发生什么。`;
    } else {
      feedback = `直线 MSE = ${roundTo(fit.mse, 2)}，残差平方的原理也答对了，本关通过。`;
    }
    return {
      passed,
      feedback,
      summary: {
        stage: 1,
        passed,
        detail: `w=${roundTo(fit.slope, 2)}, b=${roundTo(fit.intercept, 1)}, MSE=${roundTo(fit.mse, 2)}`,
      },
    };
  }

  if (stageIndex === 2) {
    const d = draft as ConditionalProbDraft;
    const v1 = parsePercentInput(d.pRain);
    const v2 = parsePercentInput(d.pRainGivenForecast);
    const v3 = parsePercentInput(d.pForecastGivenRain);
    const ok1 = v1 !== null && Math.abs(v1 - WEATHER_EXPECTED.pRain) <= 1;
    const ok2 = v2 !== null && Math.abs(v2 - WEATHER_EXPECTED.pRainGivenForecast) <= 1;
    const ok3 = v3 !== null && Math.abs(v3 - WEATHER_EXPECTED.pForecastGivenRain) <= 1;
    const qOk = stage.question ? d.answer === stage.question.correct : true;
    const passed = ok1 && ok2 && ok3 && qOk;

    let feedback: string;
    if (!ok1 || !ok2 || !ok3) {
      const missing: string[] = [];
      if (!ok1) missing.push("P(真下雨)");
      if (!ok2) missing.push("P(真下雨 | 预报下雨)");
      if (!ok3) missing.push("P(预报下雨 | 真下雨)");
      feedback = `以下概率还需要再核对：${missing.join("、")}。可以点击方阵上方的筛选按钮，按剩余样本数格子。`;
    } else if (!qOk) {
      feedback = "三个概率都算对了。再完成下方的条件概率小问答即可过关。";
    } else {
      feedback = "三个概率与条件概率问答都正确，本关通过。";
    }
    return {
      passed,
      feedback,
      summary: {
        stage: 2,
        passed,
        detail: `P(R)=${d.pRain || "?"}, P(R|F)=${d.pRainGivenForecast || "?"}, P(F|R)=${d.pForecastGivenRain || "?"}`,
      },
    };
  }

  if (stageIndex === 3) {
    const d = draft as LikelihoodDraft;
    const pOk = isNearCoinMLE(d.p);
    const qOk = stage.question ? d.answer === stage.question.correct : true;
    const passed = pOk && qOk;
    let feedback: string;
    if (!pOk) {
      feedback = `当前 p = ${roundTo(d.p, 2)} 还不是似然曲线的最高点（负对数似然的最低点）。继续调整滑块。`;
    } else if (!qOk) {
      feedback = `最大似然估计值 p ≈ ${roundTo(d.p, 2)} 已找到。再答对下方关于负对数似然的小问答即可过关。`;
    } else {
      feedback = `p = ${roundTo(d.p, 2)} 接近这组抛掷记录的最大似然估计，负对数似然的问答也正确，本关通过。`;
    }
    return {
      passed,
      feedback,
      summary: {
        stage: 3,
        passed,
        detail: `p=${roundTo(d.p, 2)}`,
      },
    };
  }

  // Stage 4: Sigmoid bridge
  const d = draft as SigmoidBridgeDraft;
  const fit = evaluateSigmoidFit(d.w, d.b);
  const accOk = fit.accuracy >= SIGMOID_ACCURACY_THRESHOLD;
  const lossOk = fit.logLoss <= SIGMOID_LOGLOSS_THRESHOLD;
  const passed = d.curveMode === "sigmoid" && accOk && lossOk;
  let feedback: string;
  if (d.curveMode !== "sigmoid") {
    feedback = "请先切换到 Sigmoid 曲线，再检查分类准确率和平均对数损失。";
  } else if (!accOk) {
    feedback = `当前准确率 ${Math.round(fit.accuracy * 100)}%（${fit.correctCount}/10），需要达到 90% 以上。试着把分界点 -b/w 移到 4.4 小时附近。`;
  } else if (!lossOk) {
    feedback = `准确率已经达标（${Math.round(fit.accuracy * 100)}%），但平均对数损失 = ${roundTo(fit.logLoss, 3)} 还高于 ${SIGMOID_LOGLOSS_THRESHOLD}。试着调大斜率 w，让曲线在分界点附近更陡。`;
  } else {
    feedback = `Sigmoid 分类器准确率 ${Math.round(fit.accuracy * 100)}%，平均对数损失 ${roundTo(fit.logLoss, 3)}，均达到要求。本关通过，可以进入逻辑回归实验。`;
  }
  return {
    passed,
    feedback,
    summary: {
      stage: 4,
      passed,
      detail: `w=${roundTo(fit.w, 2)}, b=${roundTo(fit.b, 2)}, acc=${Math.round(fit.accuracy * 100)}%, loss=${roundTo(fit.logLoss, 3)}`,
    },
  };
}
