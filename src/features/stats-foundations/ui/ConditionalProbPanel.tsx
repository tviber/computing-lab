import { ConceptQuestion } from "./ConceptQuestion.tsx";
import { useState } from "react";
import type { ConditionalProbDraft } from "../domain/protocol.ts";
import type { StatsConceptQuestion } from "../domain/stages.ts";
import {
  computeBayesRain,
  roundTo,
  WEATHER_COUNTS,
  WEATHER_GRID_CELLS,
  WEATHER_TOTAL,
  type WeatherOutcome,
} from "../domain/statsMath.ts";

type Props = {
  draft: ConditionalProbDraft;
  question?: StatsConceptQuestion;
  passed: boolean;
  onChange: (next: ConditionalProbDraft) => void;
};

type FilterMode = "all" | "forecast-rain" | "actual-rain";

const OUTCOME_LABEL: Record<WeatherOutcome, string> = {
  tp: "预报下雨 & 真下雨",
  fp: "预报下雨 & 没下雨",
  fn: "预报不下雨 & 真下雨",
  tn: "预报不下雨 & 没下雨",
};

function matchesFilter(outcome: WeatherOutcome, filter: FilterMode): boolean {
  if (filter === "all") return true;
  if (filter === "forecast-rain") return outcome === "tp" || outcome === "fp";
  return outcome === "tp" || outcome === "fn";
}

export function ConditionalProbPanel({ draft, question, passed, onChange }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [baseRainPct, setBaseRainPct] = useState(30);
  const bayes = computeBayesRain(baseRainPct);

  const activeCount =
    filter === "all"
      ? WEATHER_TOTAL
      : filter === "forecast-rain"
        ? WEATHER_COUNTS.tp + WEATHER_COUNTS.fp
        : WEATHER_COUNTS.tp + WEATHER_COUNTS.fn;

  return (
    <div className="sf-panel">
      <div className="sf-workspace-grid">
        <div className="sf-chart-card">
          <div className="sf-chart-header">
            <h3>100 天校园天气方阵（1 格 = 1 天）</h3>
            <div className="sf-filter-pills" role="group" aria-label="筛选条件">
              <button
                aria-pressed={filter === "all"}
                className={filter === "all" ? "is-active" : ""}
                onClick={() => setFilter("all")}
                type="button"
              >
                全部 100 天
              </button>
              <button
                aria-pressed={filter === "forecast-rain"}
                className={filter === "forecast-rain" ? "is-active" : ""}
                onClick={() => setFilter("forecast-rain")}
                type="button"
              >
                只看预报下雨 (40)
              </button>
              <button
                aria-pressed={filter === "actual-rain"}
                className={filter === "actual-rain" ? "is-active" : ""}
                onClick={() => setFilter("actual-rain")}
                type="button"
              >
                只看实际下雨 (30)
              </button>
            </div>
          </div>

          <div className="sf-weather-grid" aria-hidden="true">
            {WEATHER_GRID_CELLS.map((cell) => {
              const active = matchesFilter(cell.outcome, filter);
              return (
                <div
                  className={`sf-weather-cell is-${cell.outcome} ${active ? "" : "is-dimmed"}`}
                  key={cell.index}
                  title={`第 ${cell.index + 1} 天：${OUTCOME_LABEL[cell.outcome]}`}
                />
              );
            })}
          </div>

          <div className="sf-legend-row">
            <span className="sf-legend-item">
              <i className="sf-swatch is-tp" /> 预报下雨 & 真下雨 ({WEATHER_COUNTS.tp})
            </span>
            <span className="sf-legend-item">
              <i className="sf-swatch is-fp" /> 预报下雨 & 没下雨 ({WEATHER_COUNTS.fp})
            </span>
            <span className="sf-legend-item">
              <i className="sf-swatch is-fn" /> 预报不下雨 & 真下雨 ({WEATHER_COUNTS.fn})
            </span>
            <span className="sf-legend-item">
              <i className="sf-swatch is-tn" /> 预报不下雨 & 没下雨 ({WEATHER_COUNTS.tn})
            </span>
          </div>

          <p className="sf-filter-summary">
            当前亮着的格子共有 <strong>{activeCount} 天</strong>（这就是条件概率的分母！）。
          </p>
        </div>

        <div className="sf-controls-card">
          <table className="sf-contingency-table">
            <caption>100 天预报与实际天气对照（天）</caption>
            <thead>
              <tr>
                <td />
                <th scope="col">实际下雨</th>
                <th scope="col">实际没下雨</th>
                <th scope="col">合计</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">预报下雨</th>
                <td className="sf-mono">{WEATHER_COUNTS.tp}</td>
                <td className="sf-mono">{WEATHER_COUNTS.fp}</td>
                <td className="sf-mono">{WEATHER_COUNTS.tp + WEATHER_COUNTS.fp}</td>
              </tr>
              <tr>
                <th scope="row">预报不下雨</th>
                <td className="sf-mono">{WEATHER_COUNTS.fn}</td>
                <td className="sf-mono">{WEATHER_COUNTS.tn}</td>
                <td className="sf-mono">{WEATHER_COUNTS.fn + WEATHER_COUNTS.tn}</td>
              </tr>
              <tr>
                <th scope="row">合计</th>
                <td className="sf-mono">{WEATHER_COUNTS.tp + WEATHER_COUNTS.fn}</td>
                <td className="sf-mono">{WEATHER_COUNTS.fp + WEATHER_COUNTS.tn}</td>
                <td className="sf-mono">{WEATHER_TOTAL}</td>
              </tr>
            </tbody>
          </table>

          <div className="sf-input-stack">
            <label className="sf-input-row">
              <span>1. P(真下雨) =</span>
              <div className="sf-pct-input">
                <input
                  aria-label="P(真下雨) 百分比"
                  inputMode="decimal"
                  maxLength={10}
                  onChange={(e) => onChange({ ...draft, pRain: e.target.value })}
                  placeholder="例如 30"
                  type="text"
                  value={draft.pRain}
                />
                <span>%</span>
              </div>
            </label>
            <label className="sf-input-row">
              <span>2. P(真下雨 | 预报下雨) =</span>
              <div className="sf-pct-input">
                <input
                  aria-label="P(真下雨 | 预报下雨) 百分比"
                  inputMode="decimal"
                  maxLength={10}
                  onChange={(e) => onChange({ ...draft, pRainGivenForecast: e.target.value })}
                  placeholder="24 ÷ 40"
                  type="text"
                  value={draft.pRainGivenForecast}
                />
                <span>%</span>
              </div>
            </label>
            <label className="sf-input-row">
              <span>3. P(预报下雨 | 真下雨) =</span>
              <div className="sf-pct-input">
                <input
                  aria-label="P(预报下雨 | 真下雨) 百分比"
                  inputMode="decimal"
                  maxLength={10}
                  onChange={(e) => onChange({ ...draft, pForecastGivenRain: e.target.value })}
                  placeholder="24 ÷ 30"
                  type="text"
                  value={draft.pForecastGivenRain}
                />
                <span>%</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="sf-sandbox-card">
        <div className="sf-sandbox-head">
          <h4>贝叶斯直觉沙盒：如果搬去「沙漠城市」会怎样？</h4>
          <span className="sf-mono">
            预报下雨时真下雨的概率 ≈ <strong>{roundTo(bayes.pRainGivenForecastPct, 1)}%</strong>
          </span>
        </div>
        <p className="sf-sandbox-desc">
          假设气象台水平不变（真下雨时 80% 能报准，没下雨时约 23%（16/70）
          会误报）。拖动下方滑块改变当地原本的下雨频率，看看预报的可信度怎么变：
        </p>
        <div className="sf-slider-group">
          <div className="sf-slider-head">
            <label htmlFor="sf-base-rain">当地基础下雨率 P(真下雨)</label>
            <span className="sf-mono">{baseRainPct}%</span>
          </div>
          <input
            id="sf-base-rain"
            max={70}
            min={5}
            onChange={(e) => setBaseRainPct(Number(e.target.value))}
            step={5}
            type="range"
            value={baseRainPct}
          />
        </div>
      </div>

      {question && (
        <ConceptQuestion
          question={question}
          answer={draft.answer}
          passed={passed}
          onAnswer={(answer) => onChange({ ...draft, answer })}
        />
      )}
    </div>
  );
}
