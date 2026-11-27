import { createMemo, createSignal, For, Show } from "solid-js";
import { formatScore, ticketText, type PreviewRow } from "./OrderPreviewTable.tsx";

export function ConfidenceScatter(props: { rows: PreviewRow[]; mode: "raw" | "run" }) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const selected = createMemo(() => props.rows.find((row) => row.id === selectedId()) ?? null);
  const geometry = createMemo(() => {
    const rows = props.rows;
    const width = 640;
    const height = 300;
    const left = 64;
    const right = 612;
    const top = 26;
    const bottom = 248;
    const similarities = rows.map((row) => row.prediction.similarity);
    const margins = rows.map((row) => row.prediction.margin);
    const xMin = Math.max(0, Math.min(0.9, Math.floor(Math.min(...similarities) * 20) / 20 - 0.02));
    const xMax = Math.min(1, Math.max(0.98, Math.ceil(Math.max(...similarities) * 20) / 20 + 0.01));
    const yMax = Math.max(0.05, Math.ceil(Math.max(...margins) * 50) / 50 + 0.01);
    const px = (value: number) => left + ((value - xMin) / (xMax - xMin)) * (right - left);
    const py = (value: number) => bottom - (value / yMax) * (bottom - top);
    const xTicks = [0, 1, 2, 3, 4].map((i) => xMin + ((xMax - xMin) * i) / 4);
    const yTicks = [0, 1, 2, 3].map((i) => (yMax * i) / 3);
    return { width, height, left, right, top, bottom, xMin, xMax, yMax, px, py, xTicks, yTicks };
  });

  const pointClass = (row: PreviewRow) => {
    const status = row.correct === false ? "wrong" : row.correct === true ? "right" : "neutral";
    return `lunch-scatter-dot ${status}${row.confirmed ? " confirmed" : ""}`;
  };

  return (
    <figure class="lunch-scatter">
      <svg
        aria-label="订单的 similarity 和 margin 散点图，红点是 AI 记错的订单"
        role="img"
        viewBox={`0 0 ${geometry().width} ${geometry().height}`}
      >
        <For each={geometry().yTicks}>
          {(tick) => (
            <>
              <line
                class="lunch-scatter-grid"
                x1={geometry().left}
                x2={geometry().right}
                y1={geometry().py(tick)}
                y2={geometry().py(tick)}
              />
              <text class="lunch-scatter-tick" x={geometry().left - 10} y={geometry().py(tick) + 4}>
                {tick.toFixed(2)}
              </text>
            </>
          )}
        </For>
        <For each={geometry().xTicks}>
          {(tick) => (
            <>
              <line
                class="lunch-scatter-grid"
                x1={geometry().px(tick)}
                x2={geometry().px(tick)}
                y1={geometry().top}
                y2={geometry().bottom}
              />
              <text
                class="lunch-scatter-tick"
                text-anchor="middle"
                x={geometry().px(tick)}
                y={geometry().bottom + 18}
              >
                {tick.toFixed(2)}
              </text>
            </>
          )}
        </For>
        <line
          class="lunch-scatter-axis"
          x1={geometry().left}
          x2={geometry().right}
          y1={geometry().bottom}
          y2={geometry().bottom}
        />
        <line
          class="lunch-scatter-axis"
          x1={geometry().left}
          x2={geometry().left}
          y1={geometry().top}
          y2={geometry().bottom}
        />
        <text
          class="lunch-scatter-label"
          text-anchor="middle"
          x={(geometry().left + geometry().right) / 2}
          y={geometry().height - 8}
        >
          similarity（越靠右，AI 越像见过这种说法）
        </text>
        <text class="lunch-scatter-label" x={geometry().left - 46} y={geometry().top - 8}>
          margin
        </text>
        <For each={props.rows}>
          {(row) => {
            const x = () => geometry().px(row.prediction.similarity);
            const y = () => geometry().py(row.prediction.margin);
            const labelY = () => (y() < geometry().top + 18 ? y() + 16 : y() - 10);
            const choose = () => setSelectedId(row.id);
            return (
              <g
                aria-label={`${row.id}：${row.request}`}
                class="lunch-scatter-point"
                onClick={choose}
                onFocus={choose}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                  }
                }}
                onMouseEnter={choose}
                role="button"
                tabindex={0}
              >
                <Show when={row.confirmed}>
                  <circle class="lunch-scatter-halo" cx={x()} cy={y()} r={12} />
                </Show>
                <circle
                  class={`${pointClass(row)}${selectedId() === row.id ? " selected" : ""}`}
                  cx={x()}
                  cy={y()}
                  r={selectedId() === row.id ? 8 : 6}
                >
                  <title>
                    {row.id}：{row.request}。similarity {formatScore(row.prediction.similarity)}
                    ，margin {formatScore(row.prediction.margin)}
                    {row.correct === false ? "，AI 记错" : ""}
                    {row.confirmed ? "，已要求确认" : ""}
                  </title>
                </circle>
                <text class="lunch-scatter-id" text-anchor="middle" x={x()} y={labelY()}>
                  {row.id}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
      <figcaption>
        {props.mode === "raw"
          ? "这是 AI 裸跑的结果。红点是它已经猜错的单；先看它们落在哪，再决定 need_confirm 该在哪些分数上拦一下。"
          : "空心圈是你要求确认的单，它们会让接单台多停 1 拍。看看这些圈有没有落在红点附近。"}
      </figcaption>
      <Show when={selected()}>
        {(row) => (
          <div class="lunch-scatter-detail" role="status">
            <p>
              <b>{row().id}</b>
              <span>「{row().request}」</span>
            </p>
            <small>
              AI 小票：{ticketText(row().prediction)} · similarity{" "}
              {formatScore(row().prediction.similarity)} · margin{" "}
              {formatScore(row().prediction.margin)}
              {row().correct === false ? " · 已猜错" : ""}
              {row().confirmed ? " · 会让接单台停 1 拍" : ""}
            </small>
          </div>
        )}
      </Show>
      <div class="lunch-scatter-legend">
        <span>
          <i class="right" />
          记对
        </span>
        <span>
          <i class="wrong" />
          记错
        </span>
        <span>
          <i class="ring" />
          空心 = 停 1 拍确认
        </span>
      </div>
    </figure>
  );
}
