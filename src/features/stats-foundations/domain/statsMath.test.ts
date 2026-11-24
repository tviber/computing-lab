import { describe, expect, it } from "vitest";
import {
  isNearCoinMLE,
  COIN_MLE_OPTIMAL,
  coinLikelihood,
  coinNegLogLikelihood,
  computeBayesRain,
  computeOptimalLinearFit,
  evaluateLinearFit,
  evaluateSigmoidFit,
  LINEAR_MSE_THRESHOLD,
  SIGMOID_ACCURACY_THRESHOLD,
  SIGMOID_LOGLOSS_THRESHOLD,
  WEATHER_COUNTS,
  WEATHER_GRID_CELLS,
  WEATHER_TOTAL,
} from "./statsMath.ts";

describe("stats-foundations domain math", () => {
  it("computes optimal linear fit well below MSE threshold", () => {
    const opt = computeOptimalLinearFit();
    expect(opt.mse).toBeLessThan(LINEAR_MSE_THRESHOLD);
    const poor = evaluateLinearFit(0.5, 10);
    expect(poor.mse).toBeGreaterThan(LINEAR_MSE_THRESHOLD);
  });

  it("constructs a 100-day weather grid matching contingency counts", () => {
    expect(WEATHER_TOTAL).toBe(100);
    expect(WEATHER_GRID_CELLS).toHaveLength(100);
    const tpCount = WEATHER_GRID_CELLS.filter((c) => c.outcome === "tp").length;
    expect(tpCount).toBe(WEATHER_COUNTS.tp);

    expect(computeBayesRain(30).pRainGivenForecastPct).toBeCloseTo(60);

    // Lower base rate reduces posterior P(Rain | Forecast Rain)
    const dryCity = computeBayesRain(5);
    const rainyCity = computeBayesRain(50);
    expect(dryCity.pRainGivenForecastPct).toBeLessThan(rainyCity.pRainGivenForecastPct);
  });

  it("peaks likelihood and minimizes negative log-likelihood at p = 0.7", () => {
    expect([0.66, 0.67, 0.7, 0.73, 0.74].map(isNearCoinMLE)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    const lOpt = coinLikelihood(COIN_MLE_OPTIMAL);
    expect(lOpt).toBeGreaterThan(coinLikelihood(0.5));
    expect(lOpt).toBeGreaterThan(coinLikelihood(0.9));

    const nllOpt = coinNegLogLikelihood(COIN_MLE_OPTIMAL);
    expect(nllOpt).toBeLessThan(coinNegLogLikelihood(0.5));
    expect(nllOpt).toBeLessThan(coinNegLogLikelihood(0.9));
  });

  it("evaluates sigmoid bridge fit and passes with a clean decision boundary", () => {
    const good = evaluateSigmoidFit(2.0, -8.8);
    expect(good.accuracy).toBeGreaterThanOrEqual(SIGMOID_ACCURACY_THRESHOLD);
    expect(good.logLoss).toBeLessThanOrEqual(SIGMOID_LOGLOSS_THRESHOLD);

    const poor = evaluateSigmoidFit(0.5, 0);
    expect(poor.accuracy).toBeLessThan(SIGMOID_ACCURACY_THRESHOLD);
  });
});
