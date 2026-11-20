import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
const retryHints = {
  choose: "先选一个判断，再提交。",
  point: "只选一枚时，还要指出一格：来包在这里和它相同，和另一枚不同。",
  same: "这一格和甲、乙都对得上，排除不了任何一枚。换一格找证据，或改选判断再试。",
  compare: "要说两枚都可能，每一格都得对得上。逐行找找，哪一格能排除一枚？",
  mismatch: "你选的徽章在这一格与来包不同。这格排除的正是它，保留这格再选一次。",
};

type LabeledGrid = { label: string; image: BinaryImage };

function RowComparison({ grids, size }: { grids: LabeledGrid[]; size: number }) {
  const captionId = useId();
  const columns = grids.map(({ label, image }) => ({ label, rows: imageToRows(image) }));

  return (
    <details className="receiver-row-comparison">
      <summary>按行查看 0/1</summary>
      <div aria-labelledby={captionId} className="receiver-table-scroll" role="region" tabIndex={0}>
        <table className="receiver-row-table">
          <caption id={captionId}>各行格值（从左到右）</caption>
          <thead>
            <tr>
              <th scope="col">行</th>
              {columns.map(({ label }) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: size }, (_, row) => (
              <tr key={row}>
                <th scope="row">{row + 1}</th>
                {columns.map(({ label, rows }) => (
                  <td key={label}>
                    <code>{Array.from(rows[row]).join(" ")}</code>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CoordinatePicker({
  size,
  cell,
  onPick,
}: {
  size: number;
  cell: ReceiverCell | null;
  onPick: (cx: number, cy: number) => void;
}) {
  return (
    <div className="receiver-coordinates">
      {(["cy", "cx"] as const).map((axis) => {
        const label = axis === "cy" ? "行" : "列";
        return (
          <label key={axis}>
            {label}
            <select
              aria-label={`证据${label}`}
              onChange={(event) => {
                const index = Number(event.target.value);
                if (axis === "cy") onPick(cell?.cx ?? 0, index);
                else onPick(index, cell?.cy ?? 0);
              }}
              value={cell?.[axis] ?? ""}
            >
              <option disabled value="">
                —
              </option>
              {Array.from({ length: size }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function CellProof({ round, cell }: { round: ReceiverRound; cell: ReceiverCell }) {
  return (
    <>
      <p>
        回看两枚原图的第 {cell.cy + 1} 行、第 {cell.cx + 1} 列采样格。格内黑色像素不到一半发
        0，达到一半就发 1，刚好一半也算。
      </p>
      <ul className="receiver-counts">
        {(["a", "b"] as const).map((candidate) => {
          const label = candidate === "a" ? "甲" : "乙";
          const crop = imageFromLists(
            cellRegion(round.originals[candidate], round.size, round.size, cell.cx, cell.cy),
          );
          const on = inkCount(crop);
          const total = crop.cells.length;
          const bit = round.grids[candidate].cells[cell.cy * round.size + cell.cx];
          const relation = on === total / 2 ? "刚好一半" : bit ? "超过一半" : "不到一半";
          return (
            <li key={candidate}>
              <figure className="receiver-crop">
                <figcaption>
                  <strong>
                    {label} · {crop.width}×{crop.height} 裁切
                  </strong>
                  <span>
                    黑色 {on} / {total}，{relation}
                  </span>
                  <b>发 {bit}</b>
                </figcaption>
                <BitmapCanvas
                  ariaLabel={`候选${label}原图裁切`}
                  grid="strong"
                  image={crop}
                  pixelSize={192 / crop.width}
                />
              </figure>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ReceiverTransmission({ level, onNext }: { level: ReceiverLevel; onNext: () => void }) {
  const round = useMemo(() => createReceiverRound(level), [level]);
  const [choice, setChoice] = useState<ReceiverChoice | null>(null);
  const [cell, setCell] = useState<ReceiverCell | null>(null);
  const [verdict, setVerdict] = useState<ReturnType<typeof checkReceiverAnswer> | null>(null);
  const roundTitle = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const resendButton = useRef<HTMLButtonElement>(null);
  const choiceGroupName = useId();
  const hintId = useId();
  const feedbackId = useId();
  const finished = verdict === "collision" || verdict === "proved";
  const inspecting = !finished;
  const values = receiverCellValues(round, cell);
  const grids = [
    { label: "匿名来包", image: round.packet },
    { label: "候选甲", image: round.grids.a },
    { label: "候选乙", image: round.grids.b },
  ];
  const cost = round.size * round.size;
  const fineSize = RECEIVER_GRID_SIZE.fine;
  const matchedBadge = choice === "a" ? "甲" : "乙";
  const otherBadge = choice === "a" ? "乙" : "甲";

  useEffect(() => {
    (finished ? resultTitle : roundTitle).current?.focus();
    resendButton.current?.scrollIntoView({ block: "nearest" });
  }, [finished]);

  const pick = (cx: number, cy: number) => {
    if (cell?.cx === cx && cell.cy === cy) return;
    setCell({ cx, cy });
    if (!finished) setVerdict(null);
  };

  const message =
    verdict === "collision"
      ? `${cost} 格逐格都相同，甲和乙都能发出这份包。`
      : verdict === "proved"
        ? `来包这一格是 ${values?.packet}，与${matchedBadge}相同，与${otherBadge}不同。来包只可能来自${matchedBadge}。`
        : verdict === "point" && level === "coarse"
          ? "找找有没有一格能排除另一枚。点一格或选择行、列试试。"
          : verdict && retryHints[verdict];

  return (
    <div className="receiver-round">
      <div className="receiver-round-heading">
        <h4 ref={roundTitle} tabIndex={-1}>
          {level === "coarse" ? "第 1 轮 · 初次来包" : "第 2 轮 · 同一枚徽章重发"}
        </h4>
        <span>
          {round.size}×{round.size} · 本包 {cost} 格
        </span>
      </div>
      <p>
        {level === "coarse"
          ? "来包来自甲或乙。把它与两枚候选的采样图逐格比对。"
          : "比对同一枚徽章重发的来包。判断来自哪一枚后，还要选出能排除另一枚的一格。"}
        两枚候选都按内置多数规则采样，黑格是 1，白格是 0。
      </p>
      <div className="receiver-triptych">
        {grids.map(({ label, image }) => (
          <figure key={label}>
            <figcaption>{label}</figcaption>
            <BitmapCanvas
              ariaDescribedBy={inspecting ? hintId : undefined}
              ariaLabel={`${label}网格`}
              grid="strong"
              highlight={cell}
              image={image}
              onCellClick={inspecting ? pick : undefined}
              pixelSize={192 / round.size}
            />
          </figure>
        ))}
      </div>
      {inspecting ? (
        <p className="receiver-hint" id={hintId}>
          点任意图选一格，三张图会框出同一位置。也可选行、列，或聚焦网格后按方向键移动。
        </p>
      ) : null}
      {inspecting ? (
        <div className="receiver-readout">
          <CoordinatePicker cell={cell} onPick={pick} size={round.size} />
          <p aria-atomic="true" aria-label="同位读数" role="status">
            {cell && values ? (
              <>
                第 {cell.cy + 1} 行，第 {cell.cx + 1} 列 · 来包 <b>{values.packet}</b> · 甲{" "}
                <b>{values.a}</b> · 乙 <b>{values.b}</b>
              </>
            ) : (
              "尚未选格"
            )}
          </p>
        </div>
      ) : null}
      <RowComparison grids={grids} size={round.size} />
      <div>
        {!finished ? (
          <fieldset className="receiver-judgment">
            <legend>根据收到的格子，来包可能来自谁？</legend>
            <div className="receiver-actions">
              {(["a", "b", "both"] as const).map((candidate) => (
                <label key={candidate}>
                  <input
                    checked={choice === candidate}
                    name={choiceGroupName}
                    onChange={() => {
                      setChoice(candidate);
                      setVerdict(null);
                    }}
                    type="radio"
                  />
                  {choices[candidate]}
                </label>
              ))}
              <button
                className="button button-primary"
                onClick={() => setVerdict(checkReceiverAnswer(round, choice, cell))}
                type="button"
              >
                提交判断
              </button>
            </div>
          </fieldset>
        ) : null}
        <div className={finished ? "receiver-result" : undefined}>
          {finished ? (
            <h4 aria-describedby={feedbackId} ref={resultTitle} tabIndex={-1}>
              {verdict === "collision" ? "全班预测" : "一格证据"}
            </h4>
          ) : null}
          <p
            aria-atomic="true"
            aria-label="判断反馈"
            className="receiver-feedback"
            id={feedbackId}
            role="status"
          >
            {message}
          </p>
          {verdict === "collision" ? (
            <p>
              同一枚徽章改发 {fineSize * fineSize} 格，这次能分清吗？想想原来挤在一格里的细节，
              先说理由，再请求重发。
            </p>
          ) : null}
          {verdict === "proved" && cell ? <CellProof cell={cell} round={round} /> : null}
          {finished ? (
            <button
              className="button button-secondary"
              onClick={onNext}
              ref={verdict === "collision" ? resendButton : undefined}
              type="button"
            >
              {verdict === "collision" ? `请求重发 ${fineSize}×${fineSize}` : "重玩本题"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ReceiverExercise({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [level, setLevel] = useState<ReceiverLevel | null>(null);
  const titleId = useId();
  const exerciseId = useId();

  if (!enabled && level !== null) setLevel(null);

  return (
    <>
      {enabled ? (
        <section aria-labelledby={titleId} className="receiver-exercise">
          <div className="receiver-heading">
            <div>
              <h3 id={titleId}>{level ? "接收端挑战" : "先当一次接收员"}</h3>
              {!level ? <p>可选练习 · 比对两枚徽章，用收到的格子判断来源。</p> : null}
            </div>
            <button
              aria-controls={exerciseId}
              aria-expanded={level !== null}
              className="button button-secondary"
              onClick={(event) => {
                event.currentTarget.focus();
                setLevel(level ? null : "coarse");
              }}
              type="button"
            >
              {level ? "返回发送端" : "开始接收端挑战"}
            </button>
          </div>
          <div hidden={!level} id={exerciseId}>
            {level ? (
              <ReceiverTransmission
                key={level}
                level={level}
                onNext={() => setLevel(level === "coarse" ? "fine" : "coarse")}
              />
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="receiver-sender-view" hidden={enabled && level !== null}>
        {children}
      </div>
    </>
  );
}
