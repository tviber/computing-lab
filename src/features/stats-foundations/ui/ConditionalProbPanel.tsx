import { MathFormula } from "../../../shared/ui/MathFormula";
import { createMemo, createSignal, For, Show } from "solid-js";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
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
import { ConceptQuestion } from "./ConceptQuestion.tsx";

type Props = {
  draft: ConditionalProbDraft;
  question?: StatsConceptQuestion;
  onChange: (next: ConditionalProbDraft) => void;
};

type FilterMode = "all" | "forecast-rain" | "actual-rain";

const OUTCOME_LABEL: Record<WeatherOutcome, string> = {
  tp: "预报下雨 & 真下雨",
  fp: "预报下雨 & 没下雨",
  fn: "预报不下雨 & 真下雨",
  tn: "预报不下雨 & 没下雨",
};

const FILTER_OPTIONS: readonly { value: FilterMode; label: string }[] = [
  { value: "all", label: "全部 100 天" },
  { value: "forecast-rain", label: "只看预报下雨 (40)" },
  { value: "actual-rain", label: "只看实际下雨 (30)" },
];

function matchesFilter(outcome: WeatherOutcome, filter: FilterMode): boolean {
  if (filter === "all") return true;
  if (filter === "forecast-rain") return outcome === "tp" || outcome === "fp";
  return outcome === "tp" || outcome === "fn";
}

export function ConditionalProbPanel(props: Props) {
  const [filter, setFilter] = createSignal<FilterMode>("all");
  const [baseRainPct, setBaseRainPct] = createSignal(30);
  const bayes = createMemo(() => computeBayesRain(baseRainPct()));

  const activeCount = createMemo(() =>
    filter() === "all"
      ? WEATHER_TOTAL
      : filter() === "forecast-rain"
        ? WEATHER_COUNTS.tp + WEATHER_COUNTS.fp
        : WEATHER_COUNTS.tp + WEATHER_COUNTS.fn,
  );

  return (
    <div class="sf-panel">
      <div class="sf-workspace-grid">
        <div class="sf-chart-card">
          <div class="sf-chart-header">
            <h3>100 天校园天气方阵（1 格 = 1 天）</h3>
            <SegmentedPicker
              label="筛选条件"
              onChange={setFilter}
              options={FILTER_OPTIONS}
              value={filter()}
            />
          </div>

          <div aria-hidden="true" class="sf-weather-grid">
            <For each={WEATHER_GRID_CELLS}>
              {(cell) => (
                <div
                  class={`sf-weather-cell is-${cell.outcome} ${matchesFilter(cell.outcome, filter()) ? "" : "is-dimmed"}`}
                  title={`第 ${cell.index + 1} 天：${OUTCOME_LABEL[cell.outcome]}`}
                />
              )}
            </For>
          </div>

          <div class="sf-legend-row">
            <span class="sf-legend-item">
              <i class="sf-swatch is-tp" /> 预报下雨 & 真下雨 ({WEATHER_COUNTS.tp})
            </span>
            <span class="sf-legend-item">
              <i class="sf-swatch is-fp" /> 预报下雨 & 没下雨 ({WEATHER_COUNTS.fp})
            </span>
            <span class="sf-legend-item">
              <i class="sf-swatch is-fn" /> 预报不下雨 & 真下雨 ({WEATHER_COUNTS.fn})
            </span>
            <span class="sf-legend-item">
              <i class="sf-swatch is-tn" /> 预报不下雨 & 没下雨 ({WEATHER_COUNTS.tn})
            </span>
          </div>

          <p class="sf-filter-summary">
            当前亮着的格子共有 <strong>{activeCount()} 天</strong>，这就是条件概率的分母。
          </p>
        </div>

        <div class="sf-controls-card">
          <table class="sf-contingency-table">
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
                <td class="sf-mono">{WEATHER_COUNTS.tp}</td>
                <td class="sf-mono">{WEATHER_COUNTS.fp}</td>
                <td class="sf-mono">{WEATHER_COUNTS.tp + WEATHER_COUNTS.fp}</td>
              </tr>
              <tr>
                <th scope="row">预报不下雨</th>
                <td class="sf-mono">{WEATHER_COUNTS.fn}</td>
                <td class="sf-mono">{WEATHER_COUNTS.tn}</td>
                <td class="sf-mono">{WEATHER_COUNTS.fn + WEATHER_COUNTS.tn}</td>
              </tr>
              <tr>
                <th scope="row">合计</th>
                <td class="sf-mono">{WEATHER_COUNTS.tp + WEATHER_COUNTS.fn}</td>
                <td class="sf-mono">{WEATHER_COUNTS.fp + WEATHER_COUNTS.tn}</td>
                <td class="sf-mono">{WEATHER_TOTAL}</td>
              </tr>
            </tbody>
          </table>

          <div class="sf-input-stack">
            <label class="sf-input-row">
              <span>
                1. <MathFormula>{String.raw`P(\text{真下雨})=`}</MathFormula>
              </span>
              <div class="sf-pct-input">
                <input
                  aria-label="P(真下雨) 百分比"
                  inputmode="decimal"
                  maxlength={10}
                  onInput={(e) => props.onChange({ ...props.draft, pRain: e.currentTarget.value })}
                  placeholder="例如 30"
                  type="text"
                  value={props.draft.pRain}
                />
                <span>%</span>
              </div>
            </label>
            <label class="sf-input-row">
              <span>
                2. <MathFormula>{String.raw`P(\text{真下雨}\mid\text{预报下雨})=`}</MathFormula>
              </span>
              <div class="sf-pct-input">
                <input
                  aria-label="P(真下雨 | 预报下雨) 百分比"
                  inputmode="decimal"
                  maxlength={10}
                  onInput={(e) =>
                    props.onChange({ ...props.draft, pRainGivenForecast: e.currentTarget.value })
                  }
                  placeholder="24 ÷ 40"
                  type="text"
                  value={props.draft.pRainGivenForecast}
                />
                <span>%</span>
              </div>
            </label>
            <label class="sf-input-row">
              <span>
                3. <MathFormula>{String.raw`P(\text{预报下雨}\mid\text{真下雨})=`}</MathFormula>
              </span>
              <div class="sf-pct-input">
                <input
                  aria-label="P(预报下雨 | 真下雨) 百分比"
                  inputmode="decimal"
                  maxlength={10}
                  onInput={(e) =>
                    props.onChange({ ...props.draft, pForecastGivenRain: e.currentTarget.value })
                  }
                  placeholder="24 ÷ 30"
                  type="text"
                  value={props.draft.pForecastGivenRain}
                />
                <span>%</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div class="sf-sandbox-card">
        <div class="sf-sandbox-head">
          <h4>贝叶斯直觉沙盒：如果搬去「沙漠城市」会怎样？</h4>
          <span class="sf-mono">
            预报下雨时真下雨的概率 ≈{" "}
            <strong>
              <MathFormula>{String.raw`${roundTo(bayes().pRainGivenForecastPct, 1)}\%`}</MathFormula>
            </strong>
          </span>
        </div>
        <p class="sf-sandbox-desc">
          假设气象台水平不变（真下雨时 80% 能报准，没下雨时约 23%（
          <MathFormula>{String.raw`16/70`}</MathFormula>）
          会误报）。拖动下方滑块改变当地原本的下雨频率，看看预报的可信度怎么变：
        </p>
        <LabeledSlider
          label={
            <>
              当地基础下雨率 <MathFormula>{String.raw`P(\text{真下雨})`}</MathFormula>
            </>
          }
          max={70}
          min={5}
          onChange={setBaseRainPct}
          step={5}
          suffix="%"
          value={baseRainPct()}
        />
      </div>

      <Show when={props.question}>
        {(q) => (
          <ConceptQuestion
            answer={props.draft.answer}
            onAnswer={(answer) => props.onChange({ ...props.draft, answer })}
            question={q()}
          />
        )}
      </Show>
    </div>
  );
}
