import { MathFormula, MathText } from "../../../shared/ui/MathFormula";
/**
 * Judge verdict display: accuracy vs requirement, cells vs budget, and the
 * counterexample triptych — original → your compressed grid → the member it
 * was confused with — plus the nearest-candidate ranking.
 */

import { createMemo, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { imageFromBase64 } from "../domain/bitmap.ts";
import type { PackedImage, SamplingJudgeResult } from "../domain/protocol.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import { BitmapCanvas, type CellRect } from "./BitmapCanvas.tsx";

function PackedFigure(props: { packed: PackedImage; caption: string; region?: CellRect | null }) {
  const image = createMemo(() =>
    imageFromBase64(props.packed.width, props.packed.height, props.packed.b64),
  );
  return (
    <figure>
      <BitmapCanvas ariaLabel={props.caption} image={image()} region={props.region} />
      <figcaption>{props.caption}</figcaption>
    </figure>
  );
}

export function RecognitionPanel(props: { outcome: SamplingJudgeResult; stage: SamplingStageDef }) {
  const required = () => Math.ceil(props.outcome.requiredAccuracy * props.outcome.total);
  return (
    <section
      aria-labelledby="judge-result-title"
      class={`recognition-panel${props.outcome.passed ? " is-passed" : " is-failed"}`}
    >
      <h3 id="judge-result-title">
        判定结果：
        <Show fallback="未通过" when={props.outcome.passed}>
          通过 <Icon name="check" size={14} />
        </Show>
      </h3>
      <dl class="verdict-stats">
        <div>
          <dt>接收端仍能认出</dt>
          <dd>
            {props.outcome.identified} / {props.outcome.total} 张
            <span class="verdict-sub">
              （要求 <MathFormula>{String.raw`\ge ${required()}`}</MathFormula> 张）
            </span>
          </dd>
        </div>
        <div>
          <dt>占用了</dt>
          <dd class={props.outcome.withinBudget ? "" : "over-budget"}>
            {props.outcome.resolution.cells} 个格子
            <span class="verdict-sub">
              （预算 {props.outcome.cellBudget}
              {props.outcome.withinBudget ? "" : "，已超支"}）
            </span>
          </dd>
        </div>
        <div>
          <dt>分辨率</dt>
          <dd>
            {props.outcome.resolution.width}×{props.outcome.resolution.height}
          </dd>
        </div>
      </dl>

      <Show when={props.outcome.passed}>
        <p class="stage-takeaway">
          这一关验证了：<MathText>{props.stage.takeaway}</MathText>
          {props.outcome.resolution.cells > Math.ceil(props.outcome.cellBudget * 0.6)
            ? " 还能再少用一些格子吗？"
            : ""}
        </p>
      </Show>

      <Show when={!props.outcome.passed ? props.outcome.counterexample : null}>
        {(ce) => (
          <div class="counterexample">
            <p class="counterexample-lede">
              例子：{ce().query.label} 以{props.outcome.resolution.width}×
              {props.outcome.resolution.height} 发出去之后，
              {ce().collidedWith.length > 0
                ? `接收端收到的格子图和 ${ce()
                    .collidedWith.map((c) => c.label)
                    .join("、")} 一模一样`
                : `接收端最可能认成 ${ce().predicted?.label ?? "?"}`}
              。
              <Show when={ce().difference}>
                {(bounds) => (
                  <>
                    {"丢掉的差别在原图 "}
                    <MathFormula>{String.raw`x\in[${bounds().x0},${bounds().x1})`}</MathFormula>、
                    <MathFormula>{String.raw`y\in[${bounds().y0},${bounds().y1})`}</MathFormula>
                    {" 的 "}
                    {bounds().pixels} 个像素里（原图已框出）。它们摊不满一个格子，所以被抹平了。
                  </>
                )}
              </Show>
            </p>
            <div class="counterexample-triptych">
              <PackedFigure
                caption={`发送端原图 ${ce().query.label}`}
                packed={ce().query.full}
                region={ce().difference}
              />
              <span aria-hidden="true" class="preview-arrow">
                <Icon name="arrow-right" size={18} />
              </span>
              <PackedFigure
                caption={`接收端所见 ${props.outcome.resolution.width}×${props.outcome.resolution.height}`}
                packed={ce().query.small}
              />
              <span aria-hidden="true" class="preview-arrow">
                {ce().collidedWith.length > 0 ? "≡" : "≈"}
              </span>
              <Show when={ce().predicted}>
                {(predicted) => (
                  <PackedFigure
                    caption={`最容易混淆：${predicted().label}`}
                    packed={predicted().small}
                  />
                )}
              </Show>
            </div>
            <table class="ranking-table">
              <caption>
                最接近的候选（按轮廓距离排序）。这个排序只是帮你看谁最容易混淆，
                不参与判定：判定只看压缩后是否仍然唯一，不会去“猜”答案。
              </caption>
              <thead>
                <tr>
                  <th>候选</th>
                  <th>距离</th>
                </tr>
              </thead>
              <tbody>
                <For each={ce().ranking}>
                  {(row) => (
                    <tr>
                      <td>{row.label}</td>
                      <td>{row.distance === 0 ? "完全相同" : row.distance.toFixed(2)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </Show>

      <Show when={props.outcome.confusionPairs.length > 0}>
        <p class="confusion-callout">
          该分辨率下还有 {props.outcome.confusionPairs.length} 对分不开：
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
