/**
 * Judge verdict display for the quantization lab: how many prints stay
 * unique, the budget usage (toner slots or mapping overrides), and the
 * counterexample pair — the query's source vs printed output next to the
 * member it merged with.
 */

import { createMemo, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { imageFromBase64 } from "../domain/indexed.ts";
import { SOURCE_COLORS, sourceCellCss, TONER_RACK, tonerCellCss } from "../domain/palette.ts";
import type { PackedImage, QuantJudgeResult } from "../domain/protocol.ts";
import { PART_LABELS } from "../domain/sprites.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import { PaletteCanvas } from "./PaletteCanvas.tsx";

function PackedFigure(props: {
  packed: PackedImage;
  caption: string;
  space: "source" | "printed";
}) {
  const image = createMemo(() =>
    imageFromBase64(props.packed.width, props.packed.height, props.packed.b64),
  );
  return (
    <figure>
      <PaletteCanvas
        ariaLabel={props.caption}
        colorOf={props.space === "source" ? sourceCellCss : tonerCellCss}
        image={image()}
      />
      <figcaption>{props.caption}</figcaption>
    </figure>
  );
}

export function QuantResultPanel(props: { outcome: QuantJudgeResult; stage: QuantStageDef }) {
  const required = () => Math.ceil(props.outcome.requiredAccuracy * props.outcome.total);
  const budgetLine = () =>
    props.outcome.mode === "pick"
      ? `装了 ${props.outcome.slotsUsed} 种粉（预算 ${props.outcome.slotsBudget} 槽${
          props.outcome.withinBudget ? "" : "，已超支"
        }）`
      : `改了 ${props.outcome.overrides} 条默认映射（预算 ${props.outcome.overrideBudget} 条${
          props.outcome.withinBudget ? "" : "，已超支"
        }）`;

  return (
    <section
      aria-labelledby="quant-result-title"
      class={`quant-result${props.outcome.passed ? " is-passed" : " is-failed"}`}
    >
      <h3 id="quant-result-title">判定结果：{props.outcome.passed ? "通过" : "未通过"}</h3>
      <dl class="quant-verdict-stats">
        <div>
          <dt>接收端仍能认出</dt>
          <dd>
            {props.outcome.identified} / {props.outcome.total} 张
            <span class="quant-verdict-sub">（要求 ≥ {required()} 张）</span>
          </dd>
        </div>
        <div>
          <dt>预算</dt>
          <dd class={props.outcome.withinBudget ? "" : "is-over"}>{budgetLine()}</dd>
        </div>
        <div>
          <dt>用到的粉</dt>
          <dd>
            {props.outcome.tonersUsed.length
              ? props.outcome.tonersUsed.map((i) => `${i + 1}号 ${TONER_RACK[i].name}`).join("、")
              : "只有纸白"}
          </dd>
        </div>
      </dl>

      <Show when={props.outcome.passed}>
        <p class="stage-takeaway">这一关验证了：{props.stage.takeaway}</p>
      </Show>

      <Show when={!props.outcome.passed ? props.outcome.counterexample : null}>
        {(counterexample) => (
          <div class="quant-counterexample">
            <p class="quant-counterexample-lede">
              例子：{counterexample().query.label} 印出去后，接收端收到的图和
              {counterexample().collided
                ? ` ${counterexample().collided!.label} 一模一样`
                : "别的图无法区分"}
              。
              {counterexample().merged.length
                ? ` 丢掉的特征是：${counterexample()
                    .merged.map(
                      (m) =>
                        `${PART_LABELS[m.part]}（${SOURCE_COLORS[m.aIndex - 1]?.name ?? m.aIndex} 与 ${SOURCE_COLORS[m.bIndex - 1]?.name ?? m.bIndex} 都印成了 ${m.target < 0 ? "纸白" : TONER_RACK[m.target].name}）`,
                    )
                    .join("、")}。`
                : ""}
            </p>
            <div class="quant-triptych">
              <PackedFigure
                caption={`发送原稿 ${counterexample().query.label}`}
                packed={counterexample().query.source}
                space="source"
              />
              <span aria-hidden="true" class="quant-arrow">
                <Icon name="arrow-right" size={18} />
              </span>
              <PackedFigure
                caption={`${counterexample().query.label} 印出结果`}
                packed={counterexample().query.printed}
                space="printed"
              />
              <Show when={counterexample().collided}>
                {(collided) => (
                  <>
                    <span aria-hidden="true" class="quant-arrow">
                      ≡
                    </span>
                    <PackedFigure
                      caption={`${collided().label} 印出结果`}
                      packed={collided().printed}
                      space="printed"
                    />
                    <PackedFigure
                      caption={`发送原稿 ${collided().label}`}
                      packed={collided().source}
                      space="source"
                    />
                  </>
                )}
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={props.outcome.confusionPairs.length > 0}>
        <p class="quant-collisions-line">
          这次映射下还有 {props.outcome.confusionPairs.length} 对分不开：
          {props.outcome.confusionPairs
            .slice(0, 4)
            .map((p) => `${p.aLabel}≡${p.bLabel}`)
            .join("，")}
          {props.outcome.confusionPairs.length > 4 ? "…" : ""}
        </p>
      </Show>
    </section>
  );
}
