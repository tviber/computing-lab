import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import { Icon } from "../../../shared/ui/Icon";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import { useChangeAnimation } from "../../../shared/ui/useChangeAnimation";
import { diffBounds, imageFromLists, makeImage, type BinaryImage } from "../domain/bitmap.ts";
import {
  cellBounds,
  cellRegion,
  cellStats,
  downsample,
  type Resolution,
} from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { confusionPairs, judgeResolution } from "../domain/recognize.ts";
import { SOURCE_SIZE } from "../domain/sprites.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import type { CellPick } from "../lesson/state.ts";
import { BitmapCanvas } from "./BitmapCanvas.tsx";
import { runCellValue } from "./pyodideRunner.ts";

type ExplorerProps = {
  stage: SamplingStageDef;
  width: number;
  height: number;
  /** Whether choose_size has produced the current preview resolution. */
  resolutionReady: boolean;
  selectedCell: CellPick | null;
  onResolution: (width: number, height: number) => void;
  onCellPick: (cell: CellPick | null) => void;
  /** Student's stage-1 cell_value source; enables the "用我的规则" preview. */
  ruleCode?: string;
  /** When provided, renders a share-link button (staff only). */
  shareSearch?: Record<string, string | number>;
};

function ResolutionInputs(
  props: Pick<ExplorerProps, "stage" | "width" | "height" | "onResolution" | "resolutionReady">,
) {
  const setDim = (dim: "w" | "h", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (props.stage.mode === "square") props.onResolution(n, n);
    else props.onResolution(dim === "w" ? n : props.width, dim === "h" ? n : props.height);
  };

  return (
    <Show
      fallback={
        <div class="resolution-inputs">
          <Show
            fallback={
              <>
                <label>
                  宽
                  <input
                    aria-label="宽度（列数）"
                    max={64}
                    min={2}
                    onChange={(e) => setDim("w", e.currentTarget.value)}
                    onInput={(e) => setDim("w", e.currentTarget.value)}
                    type="number"
                    value={props.width}
                  />
                </label>
                <span aria-hidden="true">×</span>
                <label>
                  高
                  <input
                    aria-label="高度（行数）"
                    max={64}
                    min={2}
                    onChange={(e) => setDim("h", e.currentTarget.value)}
                    onInput={(e) => setDim("h", e.currentTarget.value)}
                    type="number"
                    value={props.height}
                  />
                </label>
              </>
            }
            when={props.stage.mode === "square"}
          >
            <label>
              n × n
              <input
                aria-label="正方形边长 n"
                max={64}
                min={2}
                onChange={(e) => setDim("w", e.currentTarget.value)}
                onInput={(e) => setDim("w", e.currentTarget.value)}
                type="number"
                value={props.width}
              />
            </label>
          </Show>
          <span class="cell-count">
            {SOURCE_SIZE * SOURCE_SIZE} 个位置 → {props.width * props.height} 个格子（保留{" "}
            {((props.width * props.height * 100) / (SOURCE_SIZE * SOURCE_SIZE)).toFixed(1)}%）
          </span>
        </div>
      }
      when={props.stage.requiresChooseSize}
    >
      <div class="resolution-inputs resolution-code-status" role="status">
        <strong>分辨率由 choose_size(images) 决定</strong>
        <span>
          {props.resolutionReady
            ? `当前结果：${props.width} × ${props.height}（${props.width * props.height} 个格子）`
            : "先运行下方代码，生成本关的分辨率。"}
        </span>
      </div>
    </Show>
  );
}

/** Every target cell of member.image at (w,h) as a 2D region list. */
function allRegions(image: BinaryImage, width: number, height: number): number[][][] {
  const regions: number[][][] = [];
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      regions.push(cellRegion(image, width, height, cx, cy));
    }
  }
  return regions;
}

export function DownsampleExplorer(props: ExplorerProps) {
  const gallery = createMemo(() => publicGalleryFor(props.stage.category));
  const [memberIndex, setMemberIndex] = createSignal(0);
  const member = createMemo(() => gallery()[Math.min(memberIndex(), gallery().length - 1)]);
  const [inspectedPairId, setInspectedPairId] = createSignal<string | null>(null);
  const [useMyRule, setUseMyRule] = createSignal(false);
  const [preview, setPreview] = createSignal<{
    source: BinaryImage;
    code: string;
    grid: BinaryImage | null;
    invalid: Set<number>;
    error: string | null;
  } | null>(null);

  const customCode = createMemo(() =>
    !props.stage.requiresChooseSize && useMyRule() ? props.ruleCode?.trim() : undefined,
  );

  const builtinCompressed = createMemo(() => downsample(member().image, props.width, props.height));

  // Run the student's cell_value over every cell of the displayed member.
  createEffect(
    () => {
      const code = customCode();
      if (!code) return null;
      return {
        code,
        image: member().image,
        width: props.width,
        height: props.height,
        source: builtinCompressed(),
      };
    },
    (input) => {
      if (!input) return;
      let current = true;
      const { code, image, width, height, source } = input;
      const timer = setTimeout(() => {
        void runCellValue(code, allRegions(image, width, height))
          .then((results) => {
            if (!current) return;
            const grid = makeImage(width, height);
            const invalid = new Set<number>();
            for (let index = 0; index < grid.cells.length; index += 1) {
              const value = results[index];
              if (value === 0 || value === 1 || typeof value === "boolean") {
                grid.cells[index] = Number(value);
              } else {
                invalid.add(index);
              }
            }
            setPreview({
              source,
              code,
              grid,
              invalid,
              error: invalid.size
                ? `有 ${invalid.size} 格没有返回 0 或 1，图中暂按 0 显示。`
                : null,
            });
          })
          .catch((err: unknown) => {
            if (current) {
              setPreview({
                source,
                code,
                grid: null,
                invalid: new Set(),
                error: err instanceof Error ? err.message : String(err),
              });
            }
          });
      }, 250);
      return () => {
        current = false;
        clearTimeout(timer);
      };
    },
  );

  const activePreview = createMemo(() => {
    const p = preview();
    return p?.code === customCode() && p?.source === builtinCompressed() ? p : null;
  });
  const compressed = createMemo(() => activePreview()?.grid ?? builtinCompressed());
  const resultRef = useChangeAnimation<HTMLElement>(
    () => compressed(),
    [
      { opacity: 0.78, transform: "translateX(4px)" },
      { opacity: 1, transform: "translateX(0)" },
    ],
  );

  const sweep = createMemo(() => {
    const g = gallery();
    return props.stage.probes.map((probe: Resolution) => {
      const report = judgeResolution(g, g, probe.width, probe.height);
      return { ...probe, cells: probe.width * probe.height, report };
    });
  });

  const pairs = createMemo(() => confusionPairs(gallery(), props.width, props.height));

  const inspection = createMemo(() => {
    const selectedCell = props.selectedCell;
    if (!selectedCell) return null;
    const currentMember = member();
    const width = props.width;
    const height = props.height;
    const bounds = cellBounds(
      currentMember.image.width,
      currentMember.image.height,
      width,
      height,
      selectedCell.cx,
      selectedCell.cy,
    );
    const { on, total } = cellStats(
      currentMember.image,
      width,
      height,
      selectedCell.cx,
      selectedCell.cy,
    );
    const region = cellRegion(currentMember.image, width, height, selectedCell.cx, selectedCell.cy);
    return {
      cx: selectedCell.cx,
      cy: selectedCell.cy,
      bounds,
      on,
      total,
      region: imageFromLists(region),
      majority: builtinCompressed().cells[selectedCell.cy * width + selectedCell.cx],
      output: compressed().cells[selectedCell.cy * width + selectedCell.cx],
    };
  });

  /** A clicked confusion pair: member A shown, diff bbox outlined on the source. */
  const inspectedPair = createMemo(() => {
    const pairId = inspectedPairId();
    if (!pairId) return null;
    const pair = pairs().find((p) => `${p.aId}-${p.bId}` === pairId);
    if (!pair) return null;
    const g = gallery();
    const a = g.find((e) => e.id === pair.aId);
    const b = g.find((e) => e.id === pair.bId);
    if (!a || !b) return null;
    return { pair, a, b, bounds: diffBounds(a.image, b.image) };
  });

  const sourceRegion = createMemo(() => inspectedPair()?.bounds ?? inspection()?.bounds ?? null);

  const pickMember = (index: number) => {
    setMemberIndex(index);
    setInspectedPairId(null);
    props.onCellPick(null);
  };

  const inspectPair = (pairKey: string, aId: string) => {
    const index = gallery().findIndex((e) => e.id === aId);
    if (index >= 0) setMemberIndex(index);
    setInspectedPairId(pairKey);
    props.onCellPick(null);
  };

  return (
    <section aria-labelledby="explorer-title" class="downsample-explorer">
      <h3 id="explorer-title">发信实验台（公开图谱 {gallery().length} 张）</h3>
      <Show when={props.shareSearch}>{(search) => <ScenarioLinkButton search={search()} />}</Show>

      <ResolutionInputs
        height={props.height}
        onResolution={props.onResolution}
        resolutionReady={props.resolutionReady}
        stage={props.stage}
        width={props.width}
      />

      <Show when={!props.stage.requiresChooseSize && props.ruleCode?.trim()}>
        <div class="rule-toggle">
          <span>接收端规则：</span>
          <SegmentedPicker
            label="预览使用的规则"
            onChange={(next) => setUseMyRule(next === "mine")}
            options={[
              { value: "builtin", label: "内置多数规则" },
              { value: "mine", label: "我写的 cell_value" },
            ]}
            value={useMyRule() ? "mine" : "builtin"}
          />
          <Show when={customCode() && !activePreview()}>
            <span class="rule-running">运行中…</span>
          </Show>
        </div>
      </Show>
      <Show when={activePreview()?.error}>
        {(err) => (
          <p class="rule-error" role="alert">
            {err()}
            {activePreview()?.grid ? "" : "（预览暂用内置规则）"}
          </p>
        )}
      </Show>

      <div class="explorer-columns">
        <div class="explorer-left">
          <div aria-label="选择要发送的信号" class="member-strip" role="listbox">
            <For each={gallery()}>
              {(entry, index) => (
                <Button
                  aria-label={`查看 ${entry.label}`}
                  aria-selected={index() === memberIndex() ? "true" : "false"}
                  class={`member-chip${index() === memberIndex() ? " is-active" : ""}`}
                  onClick={() => pickMember(index())}
                  role="option"
                  type="button"
                >
                  <BitmapCanvas ariaLabel={entry.label} image={entry.image} pixelSize={2} />
                  <span>{entry.label}</span>
                </Button>
              )}
            </For>
          </div>

          <table class="sweep-table">
            <caption>按内置多数规则，各分辨率能分清多少张</caption>
            <thead>
              <tr>
                <th>分辨率</th>
                <th>格子数</th>
                <th>可辨认</th>
              </tr>
            </thead>
            <tbody>
              <For each={sweep()}>
                {(row) => {
                  const active = () => row.width === props.width && row.height === props.height;
                  return (
                    <tr class={active() ? "is-active" : ""}>
                      <td>
                        <Show
                          fallback={
                            <Button
                              class="probe-link"
                              onClick={() =>
                                props.onResolution(
                                  row.width,
                                  props.stage.mode === "square" ? row.width : row.height,
                                )
                              }
                              type="button"
                            >
                              {row.width}×{row.height}
                            </Button>
                          }
                          when={props.stage.requiresChooseSize}
                        >
                          <span>
                            {row.width}×{row.height}
                          </span>
                        </Show>
                      </td>
                      <td>{row.cells}</td>
                      <td>
                        {row.report.identified} / {row.report.total}
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>

          <Show
            fallback={<p class="confusion-clear">按内置规则，当前分辨率能分清图谱里的每一张。</p>}
            when={pairs().length > 0}
          >
            <div class="confusion-callout" role="note">
              <strong>
                按内置规则，{props.width}×{props.height} 时有 {pairs().length} 对会撞脸：
              </strong>
              <ul>
                <For each={pairs().slice(0, 5)}>
                  {(pair) => {
                    const key = `${pair.aId}-${pair.bId}`;
                    return (
                      <li>
                        <Button
                          class={`pair-link${inspectedPairId() === key ? " is-active" : ""}`}
                          onClick={() => inspectPair(key, pair.aId)}
                          type="button"
                        >
                          {pair.aLabel} ≡ {pair.bLabel}
                        </Button>
                      </li>
                    );
                  }}
                </For>
                <Show when={pairs().length > 5}>
                  <li>…还有 {pairs().length - 5} 对</li>
                </Show>
              </ul>
              <Show
                fallback={
                  <p class="pair-diff-note">点一对，看它们的差别被哪个区域的格子抹掉了。</p>
                }
                when={inspectedPair()}
              >
                {(info) => (
                  <p class="pair-diff-note">
                    {info().bounds
                      ? `${info().pair.aLabel} 与 ${info().pair.bLabel} 的差别只在原图 x∈[${info().bounds!.x0}, ${info().bounds!.x1})、y∈[${info().bounds!.y0}, ${info().bounds!.y1}) 的 ${info().bounds!.pixels} 个像素里（原图上的虚线框）。当前网格把它抹平了。`
                      : `${info().pair.aLabel} 与 ${info().pair.bLabel} 原图完全相同。`}
                  </p>
                )}
              </Show>
            </div>
          </Show>
        </div>

        <div class="explorer-right">
          <div class="preview-pair">
            <figure>
              <BitmapCanvas
                ariaLabel={`原图 ${member().label}`}
                image={member().image}
                region={sourceRegion()}
              />
              <figcaption>
                发送端原图 {member().label} · {member().image.width}×{member().image.height}
              </figcaption>
            </figure>
            <span aria-hidden="true" class="preview-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <figure class="sampling-result" ref={resultRef}>
              <BitmapCanvas
                ariaLabel={`接收端看到的 ${props.width}×${props.height} 格子图`}
                grid
                highlight={props.selectedCell}
                image={compressed()}
                onCellClick={(cx, cy) => {
                  setInspectedPairId(null);
                  props.onCellPick(
                    props.selectedCell &&
                      props.selectedCell.cx === cx &&
                      props.selectedCell.cy === cy
                      ? null
                      : { cx, cy },
                  );
                }}
              />
              <figcaption>
                接收端所见 {props.width}×{props.height}
                {activePreview()?.grid ? " · 你的规则" : " · 内置多数规则"}
              </figcaption>
            </figure>
          </div>

          <Show
            fallback={
              <p class="cell-inspector-hint">
                点接收端任一格，数数它盖住了多少黑色像素。用键盘时，聚焦格子图后按方向键探索。
              </p>
            }
            when={inspection()}
          >
            {(info) => (
              <div class="cell-inspector" role="status">
                <BitmapCanvas
                  ariaLabel="选中格子覆盖的原图像素"
                  grid
                  image={info().region}
                  pixelSize={Math.max(
                    2,
                    Math.floor(80 / Math.max(info().region.width, info().region.height)),
                  )}
                />
                <div>
                  <strong>
                    格子 ({info().cx}, {info().cy})
                  </strong>
                  <p>
                    原图第 {info().bounds.x0}–{info().bounds.x1 - 1} 列，第 {info().bounds.y0}–
                    {info().bounds.y1 - 1} 行（从 0 数）。
                  </p>
                  <p>
                    黑色占 {info().on} / {info().total}，
                    {info().on * 2 === info().total
                      ? "刚好一半"
                      : info().majority
                        ? "超过一半"
                        : "不到一半"}
                    。内置规则发 <strong>{info().majority}</strong>。
                  </p>
                  <Show when={activePreview()?.grid}>
                    <p>
                      <Show
                        fallback={
                          <>
                            你的规则发 <strong>{info().output}</strong>。
                          </>
                        }
                        when={activePreview()?.invalid.has(info().cy * props.width + info().cx)}
                      >
                        你的规则在这一格返回了无效值，暂按 0 显示。
                      </Show>
                    </p>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
