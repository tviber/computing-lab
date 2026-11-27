import { createMemo, For, Show } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import type { MessageInspection } from "../domain/tokenizer.ts";
import { TOKEN_STATUS_LABELS } from "./tokenStatusLabels.ts";

function stableSigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

const W = 280;
const H = 140;
const PAD = 24;
const Z_MIN = -6;
const Z_MAX = 6;

const xOfZ = (z: number) =>
  PAD + ((Math.max(Z_MIN, Math.min(Z_MAX, z)) - Z_MIN) / (Z_MAX - Z_MIN)) * (W - PAD * 2);
const yOfP = (p: number) => H - PAD - p * (H - PAD * 2);

const CURVE_POINTS = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = Z_MIN + ((Z_MAX - Z_MIN) * i) / 48;
    const p = stableSigmoid(z);
    pts.push(`${xOfZ(z).toFixed(1)},${yOfP(p).toFixed(1)}`);
  }
  return pts.join(" ");
})();

export function MessageProbeCard(props: {
  inspection: MessageInspection;
  threshold?: number;
  trueLabel?: 0 | 1;
  title?: string;
}) {
  const title = () => props.title ?? "这条短信的评分依据";
  const safeThreshold = createMemo(() => Math.max(0.05, Math.min(0.95, props.threshold ?? 0.5)));
  const zCut = createMemo(() => Math.log(safeThreshold() / (1 - safeThreshold())));
  const maxAbsTerm = createMemo(() =>
    Math.max(1, ...props.inspection.terms.map((t) => Math.abs(t.weight))),
  );
  const isSpamPred = createMemo(() => props.inspection.probability >= safeThreshold());

  return (
    <div class="logistic-regression-probe-card">
      <div class="logistic-regression-probe-head">
        <div>
          <p class="eyebrow">{title()}</p>
          <p class="logistic-regression-probe-text">{props.inspection.text}</p>
        </div>
        <div class="logistic-regression-probe-badges">
          <Show when={props.trueLabel !== undefined}>
            <span
              class={`logistic-regression-pill ${props.trueLabel === 1 ? "is-danger" : "is-success"}`}
            >
              真实：{props.trueLabel === 1 ? "垃圾短信" : "正常短信"}
            </span>
          </Show>
          <span class={`logistic-regression-pill ${isSpamPred() ? "is-danger" : "is-success"}`}>
            模型判定：{isSpamPred() ? "垃圾" : "正常"}（
            {(props.inspection.probability * 100).toFixed(1)}%）
          </span>
        </div>
      </div>

      <div class="logistic-regression-token-strip">
        <For each={props.inspection.tokens}>
          {(tok) => (
            <span class={`logistic-regression-tok is-${tok.status}`} title={tok.note}>
              <span class="logistic-regression-tok-text">{tok.text}</span>
              <span class="logistic-regression-tok-tag">{TOKEN_STATUS_LABELS[tok.status]}</span>
            </span>
          )}
        </For>
      </div>

      <div class="logistic-regression-probe-grid">
        <div class="logistic-regression-waterfall">
          <p class="logistic-regression-subhead">
            这些词的分数怎样相加（总分{" "}
            <MathFormula>{String.raw`z=${props.inspection.rawZ.toFixed(2)}`}</MathFormula>）
          </p>
          <ul class="logistic-regression-waterfall-list">
            <For each={props.inspection.terms}>
              {(term) => {
                const barPct = () => Math.min(100, (Math.abs(term.weight) / maxAbsTerm()) * 100);
                const tone =
                  term.weight > 0.001 ? "is-pos" : term.weight < -0.001 ? "is-neg" : "is-zero";
                return (
                  <li class="logistic-regression-waterfall-row">
                    <span class="logistic-regression-waterfall-word">
                      {term.kind === "bias" ? term.word : `词「${term.word}」`}
                    </span>
                    <span class="logistic-regression-waterfall-bar-wrap">
                      <span
                        class={`logistic-regression-waterfall-bar ${tone}`}
                        style={{ width: `${barPct()}%` }}
                      />
                    </span>
                    <span
                      class={`logistic-regression-mono logistic-regression-waterfall-val ${tone}`}
                    >
                      {term.weight >= 0 ? "+" : ""}
                      {term.weight.toFixed(2)}
                    </span>
                    <span class="logistic-regression-mono logistic-regression-waterfall-sum">
                      → {term.cumulativeZ.toFixed(2)}
                    </span>
                  </li>
                );
              }}
            </For>
          </ul>
          <Show when={props.inspection.terms.length === 1}>
            <p class="logistic-regression-muted-note">
              没有词参与加分或减分，模型只根据偏置 b 计算概率。
            </p>
          </Show>
        </div>

        <div class="logistic-regression-sigmoid-box">
          <p class="logistic-regression-subhead">
            把总分换成概率（分类阈值{" "}
            <MathFormula>{String.raw`\tau=${safeThreshold().toFixed(2)}`}</MathFormula>）
          </p>
          <svg
            aria-label="Sigmoid 概率曲线"
            class="logistic-regression-svg-chart"
            viewBox={`0 0 ${W} ${H}`}
          >
            <line
              stroke="var(--border)"
              stroke-width="1"
              x1={PAD}
              x2={W - PAD}
              y1={yOfP(0)}
              y2={yOfP(0)}
            />
            <line
              stroke="var(--border)"
              stroke-dasharray="3 3"
              stroke-width="1"
              x1={PAD}
              x2={W - PAD}
              y1={yOfP(safeThreshold())}
              y2={yOfP(safeThreshold())}
            />
            <line
              stroke="var(--warn)"
              stroke-dasharray="3 3"
              stroke-width="1.2"
              x1={xOfZ(zCut())}
              x2={xOfZ(zCut())}
              y1={PAD}
              y2={H - PAD}
            />
            <polyline fill="none" points={CURVE_POINTS} stroke="var(--accent)" stroke-width="2.2" />
            <circle
              cx={xOfZ(props.inspection.rawZ)}
              cy={yOfP(props.inspection.probability)}
              fill={isSpamPred() ? "var(--danger)" : "var(--success)"}
              r="5"
              stroke="var(--surface)"
              stroke-width="1.5"
            />
            <text fill="var(--muted)" font-size="9" x={PAD} y={yOfP(safeThreshold()) - 4}>
              阈值 {(safeThreshold() * 100).toFixed(0)}%
            </text>
            <text fill="var(--muted)" font-size="9" text-anchor="middle" x={xOfZ(0)} y={H - 6}>
              z = 0
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
