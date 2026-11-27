import type { JSX } from "@solidjs/web";
import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { imageFromLists, imageToRows, inkCount, type BinaryImage } from "../domain/bitmap.ts";
import { cellRegion } from "../domain/downsample.ts";
import {
  checkReceiverAnswer,
  createReceiverRound,
  RECEIVER_GRID_SIZE,
  receiverCellValues,
  type ReceiverCell,
  type ReceiverChoice,
  type ReceiverLevel,
  type ReceiverRound,
} from "../domain/receiverExercise.ts";
import { BitmapCanvas } from "./BitmapCanvas.tsx";
import "./receiverExercise.css";

const choices = { a: "只可能甲", b: "只可能乙", both: "两枚都可能" } as const;
const predictions = { separate: "能区分", collide: "仍不能区分" } as const;
type Prediction = keyof typeof predictions;
type ReceiverRun = { level: ReceiverLevel; prediction: Prediction | null };

const firstRound: ReceiverRun = { level: "coarse", prediction: null };

const retryHints = {
  choose: "先选一个判断，再提交。",
  point: "只选一枚时，还要指出一格：来包在这里和它相同，和另一枚不同。",
  same: "这一格和甲、乙都对得上，排除不了任何一枚。换一格找证据，或改选判断再试。",
  compare: "要说两枚都可能，每一格都得对得上。逐行找找，哪一格能排除一枚？",
  mismatch: "你选的徽章在这一格与来包不同。这格排除的正是它，保留这格再选一次。",
};

type LabeledGrid = { label: string; image: BinaryImage };

function RowComparison(props: { grids: LabeledGrid[]; size: number }) {
  const captionId = createUniqueId();
  const columns = createMemo(() =>
    props.grids.map(({ label, image }) => ({ label, rows: imageToRows(image) })),
  );
  const rowIndices = createMemo(() => Array.from({ length: props.size }, (_, row) => row));

  return (
    <details class="receiver-row-comparison">
      <summary>按行查看 0/1</summary>
      <div aria-labelledby={captionId} class="receiver-table-scroll" role="region" tabindex={0}>
        <table class="receiver-row-table">
          <caption id={captionId}>各行格值（从左到右）</caption>
          <thead>
            <tr>
              <th scope="col">行</th>
              <For each={columns()}>{(col) => <th scope="col">{col.label}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rowIndices()}>
              {(row) => (
                <tr>
                  <th scope="row">{row + 1}</th>
                  <For each={columns()}>
                    {(col) => (
                      <td>
                        <code>{Array.from(col.rows[row]).join(" ")}</code>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CoordinatePicker(props: {
  size: number;
  cell: ReceiverCell | null;
  onPick: (cx: number, cy: number) => void;
}) {
  const indices = createMemo(() => Array.from({ length: props.size }, (_, index) => index));
  return (
    <div class="receiver-coordinates">
      <For each={["cy", "cx"] as const}>
        {(axis) => {
          const label = axis === "cy" ? "行" : "列";
          return (
            <label>
              {label}
              <select
                aria-label={`证据${label}`}
                onChange={(event) => {
                  const index = Number(event.currentTarget.value);
                  if (axis === "cy") props.onPick(props.cell?.cx ?? 0, index);
                  else props.onPick(index, props.cell?.cy ?? 0);
                }}
                value={props.cell?.[axis] !== undefined ? String(props.cell[axis]) : ""}
              >
                <option disabled selected={props.cell?.[axis] === undefined} value="">
                  —
                </option>
                <For each={indices()}>
                  {(index) => (
                    <option selected={props.cell?.[axis] === index} value={String(index)}>
                      {index + 1}
                    </option>
                  )}
                </For>
              </select>
            </label>
          );
        }}
      </For>
    </div>
  );
}

function CellProof(props: { round: ReceiverRound; cell: ReceiverCell }) {
  const candidates = createMemo(() =>
    (["a", "b"] as const).map((candidate) => {
      const label = candidate === "a" ? "甲" : "乙";
      const crop = imageFromLists(
        cellRegion(
          props.round.originals[candidate],
          props.round.size,
          props.round.size,
          props.cell.cx,
          props.cell.cy,
        ),
      );
      const on = inkCount(crop);
      const total = crop.cells.length;
      const bit =
        props.round.grids[candidate].cells[props.cell.cy * props.round.size + props.cell.cx];
      const relation = on === total / 2 ? "刚好一半" : bit ? "超过一半" : "不到一半";
      return { candidate, label, crop, on, total, bit, relation };
    }),
  );

  return (
    <>
      <p>
        回看两枚原图的第 {props.cell.cy + 1} 行、第 {props.cell.cx + 1}{" "}
        列采样格。格内黑色像素不到一半发 0，达到一半就发 1，刚好一半也算。
      </p>
      <ul class="receiver-counts">
        <For each={candidates()}>
          {(entry) => (
            <li>
              <figure class="receiver-crop">
                <figcaption>
                  <strong>
                    {entry.label} · {entry.crop.width}×{entry.crop.height} 裁切
                  </strong>
                  <span>
                    黑色 {entry.on} / {entry.total}，{entry.relation}
                  </span>
                  <b>发 {entry.bit}</b>
                </figcaption>
                <BitmapCanvas
                  ariaLabel={`候选${entry.label}原图裁切`}
                  grid="strong"
                  image={entry.crop}
                  pixelSize={192 / entry.crop.width}
                />
              </figure>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}

function ReceiverTransmission(props: {
  run: ReceiverRun;
  canSkipPrediction: boolean;
  onNext: (prediction: Prediction | null) => void;
}) {
  const round = createMemo(() => createReceiverRound(props.run.level));
  const [choice, setChoice] = createSignal<ReceiverChoice | null>(null);
  const [cell, setCell] = createSignal<ReceiverCell | null>(null);
  const [verdict, setVerdict] = createSignal<ReturnType<typeof checkReceiverAnswer> | null>(null);
  let roundTitle: HTMLHeadingElement | undefined;
  let resultTitle: HTMLHeadingElement | undefined;
  const choiceGroupName = createUniqueId();
  const hintId = createUniqueId();
  const feedbackId = createUniqueId();
  const finished = () => verdict() === "collision" || verdict() === "proved";
  const inspecting = () => !finished();
  const values = createMemo(() => receiverCellValues(round(), cell()));
  const grids = createMemo<LabeledGrid[]>(() => [
    { label: "匿名来包", image: round().packet },
    { label: "候选甲", image: round().grids.a },
    { label: "候选乙", image: round().grids.b },
  ]);
  const cost = () => round().size * round().size;
  const fineSize = RECEIVER_GRID_SIZE.fine;
  const matchedBadge = () => (choice() === "a" ? "甲" : "乙");
  const otherBadge = () => (choice() === "a" ? "乙" : "甲");

  createEffect(
    () => finished(),
    (isFinished) => {
      (isFinished ? resultTitle : roundTitle)?.focus();
    },
  );

  const pick = (cx: number, cy: number) => {
    const current = cell();
    if (current?.cx === cx && current.cy === cy) return;
    setCell({ cx, cy });
    if (!finished()) setVerdict(null);
  };

  const message = createMemo(() => {
    const v = verdict();
    if (v === "collision") return `${cost()} 格逐格都相同，甲和乙都能发出这份包。`;
    if (v === "proved") {
      return `来包这一格是 ${values()?.packet}，与${matchedBadge()}相同，与${otherBadge()}不同。来包只可能来自${matchedBadge()}。`;
    }
    if (v === "point" && props.run.level === "coarse") {
      return "找找有没有一格能排除另一枚。点一格或选择行、列试试。";
    }
    return v ? retryHints[v] : null;
  });

  return (
    <div class="receiver-round">
      <div class="receiver-round-heading">
        <h4
          ref={(el) => {
            roundTitle = el;
          }}
          tabindex={-1}
        >
          {props.run.level === "coarse" ? "第 1 轮 · 初次来包" : "第 2 轮 · 同一枚徽章重发"}
        </h4>
        <span>
          {round().size}×{round().size} · 本包 {cost()} 格
        </span>
      </div>
      <p>
        {props.run.level === "coarse"
          ? "来包来自甲或乙。把它与两枚候选的采样图逐格比对。"
          : "比对同一枚徽章重发的来包。判断来自哪一枚后，还要选出能排除另一枚的一格。"}
        两枚候选都按内置多数规则采样，黑格是 1，白格是 0。
      </p>
      <Show when={props.run.prediction && !finished()}>
        <p>你的预测：{predictions[props.run.prediction!]}。</p>
      </Show>
      <div class="receiver-triptych">
        <For each={grids()}>
          {(entry) => (
            <figure>
              <figcaption>{entry.label}</figcaption>
              <BitmapCanvas
                ariaDescribedBy={inspecting() ? hintId : undefined}
                ariaLabel={`${entry.label}网格`}
                grid="strong"
                highlight={cell()}
                image={entry.image}
                onCellClick={inspecting() ? pick : undefined}
                pixelSize={192 / round().size}
              />
            </figure>
          )}
        </For>
      </div>
      <Show when={inspecting()}>
        <p class="receiver-hint" id={hintId}>
          点任意图选一格，三张图会框出同一位置。也可选行、列，或聚焦网格后按方向键移动。
        </p>
        <div class="receiver-readout">
          <CoordinatePicker cell={cell()} onPick={pick} size={round().size} />
          <p aria-atomic="true" aria-label="同位读数" role="status">
            <Show fallback="尚未选格" when={cell() && values()}>
              第 {cell()!.cy + 1} 行，第 {cell()!.cx + 1} 列 · 来包 <b>{values()!.packet}</b> · 甲{" "}
              <b>{values()!.a}</b> · 乙 <b>{values()!.b}</b>
            </Show>
          </p>
        </div>
      </Show>
      <RowComparison grids={grids()} size={round().size} />
      <div>
        <Show when={!finished()}>
          <fieldset class="receiver-judgment">
            <legend>根据收到的格子，来包可能来自谁？</legend>
            <div class="receiver-actions">
              <For each={["a", "b", "both"] as const}>
                {(candidate) => (
                  <label class="choice-surface">
                    <input
                      checked={choice() === candidate}
                      name={choiceGroupName}
                      onChange={() => {
                        setChoice(candidate);
                        setVerdict(null);
                      }}
                      type="radio"
                    />
                    {choices[candidate]}
                  </label>
                )}
              </For>
              <Button
                class="button button-primary"
                onClick={() => setVerdict(checkReceiverAnswer(round(), choice(), cell()))}
                type="button"
              >
                提交判断
              </Button>
            </div>
          </fieldset>
        </Show>
        <div class={finished() ? "receiver-result" : undefined}>
          <Show when={finished()}>
            <h4
              aria-describedby={feedbackId}
              ref={(el) => {
                resultTitle = el;
              }}
              tabindex={-1}
            >
              {verdict() === "collision" ? "全班预测" : "一格证据"}
            </h4>
          </Show>
          <p
            aria-atomic="true"
            aria-label="判断反馈"
            class="receiver-feedback"
            id={feedbackId}
            role="status"
          >
            {message()}
          </p>
          <Show when={verdict() === "collision"}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const picked = new FormData(event.currentTarget).get("prediction");
                if (picked === "separate" || picked === "collide") props.onNext(picked);
              }}
            >
              <fieldset class="receiver-judgment">
                <legend>
                  同一枚徽章用 {fineSize}×{fineSize} 重发后，两枚能分清吗？
                </legend>
                <div class="receiver-actions">
                  <For each={["separate", "collide"] as const}>
                    {(option) => (
                      <label class="choice-surface">
                        <input name="prediction" required type="radio" value={option} />
                        {predictions[option]}
                      </label>
                    )}
                  </For>
                  <Button class="button button-primary" type="submit">
                    请求重发 {fineSize}×{fineSize}
                  </Button>
                  <Show when={props.canSkipPrediction}>
                    <Button
                      class="button button-secondary"
                      onClick={() => props.onNext(null)}
                      type="button"
                    >
                      跳过预测并重发
                    </Button>
                  </Show>
                </div>
              </fieldset>
            </form>
          </Show>
          <Show when={verdict() === "proved" && cell()}>
            {(pickedCell) => (
              <>
                <Show when={props.run.prediction}>
                  {(pred) => (
                    <p>
                      你的预测：{predictions[pred()]}。证据：第 {pickedCell().cy + 1} 行第{" "}
                      {pickedCell().cx + 1} 列的值不同，8×8 可以区分这两枚徽章。
                      {pred() === "separate" ? "结果与预测一致。" : "结果与预测不同。"}
                    </p>
                  )}
                </Show>
                <CellProof cell={pickedCell()} round={round()} />
              </>
            )}
          </Show>
          <Show when={verdict() === "proved"}>
            <Button
              class="button button-secondary"
              onClick={() => props.onNext(null)}
              type="button"
            >
              重玩本题
            </Button>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function ReceiverExercise(props: {
  enabled: boolean;
  canSkipPrediction: boolean;
  children?: JSX.Element;
}) {
  const [run, setRun] = createSignal<ReceiverRun | null>(null);
  const titleId = createUniqueId();
  const exerciseId = createUniqueId();

  createEffect(
    () => props.enabled,
    (isEnabled) => {
      if (!isEnabled) setRun(null);
    },
  );

  return (
    <>
      <Show when={props.enabled}>
        <section aria-labelledby={titleId} class="receiver-exercise">
          <div class="receiver-heading">
            <div>
              <h3 id={titleId}>{run() ? "接收端挑战" : "先当一次接收员"}</h3>
              <Show when={!run()}>
                <p>可选练习 · 比对两枚徽章，用收到的格子判断来源。</p>
              </Show>
            </div>
            <Button
              aria-controls={exerciseId}
              aria-expanded={run() !== null ? "true" : "false"}
              class="button button-secondary"
              onClick={(event) => {
                event.currentTarget.focus();
                setRun(run() ? null : { ...firstRound });
              }}
              type="button"
            >
              {run() ? "返回发送端" : "开始接收端挑战"}
            </Button>
          </div>
          <div hidden={!run()} id={exerciseId}>
            <Show keyed when={run()}>
              {(currentRun) => (
                <ReceiverTransmission
                  canSkipPrediction={props.canSkipPrediction}
                  onNext={(prediction) =>
                    setRun(
                      currentRun.level === "coarse"
                        ? { level: "fine", prediction }
                        : { ...firstRound },
                    )
                  }
                  run={currentRun}
                />
              )}
            </Show>
          </div>
        </section>
      </Show>
      <div class="receiver-sender-view" hidden={props.enabled && run() !== null}>
        {props.children}
      </div>
    </>
  );
}
