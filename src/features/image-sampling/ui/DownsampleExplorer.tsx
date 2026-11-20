import { useEffect, useMemo, useState } from "react";
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import { Icon } from "../../../shared/ui/Icon";
import { diffBounds, imageFromLists, makeImage, type BinaryImage } from "../domain/bitmap.ts";
import { cellBounds, cellRegion, cellStats, type Resolution } from "../domain/downsample.ts";
import { downsample } from "../domain/downsample.ts";
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

function ResolutionInputs({
  stage,
  width,
  height,
  resolutionReady,
  onResolution,
}: Pick<ExplorerProps, "stage" | "width" | "height" | "onResolution" | "resolutionReady">) {
  if (stage.requiresChooseSize) {
    return (
      <div className="resolution-inputs resolution-code-status" role="status">
        <strong>分辨率由 choose_size(images) 决定</strong>
        <span>
          {resolutionReady
            ? `当前结果：${width} × ${height}（${width * height} 个格子）`
            : "先运行下方代码，生成本关的分辨率。"}
        </span>
      </div>
    );
  }

  const setDim = (dim: "w" | "h", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (stage.mode === "square") onResolution(n, n);
    else onResolution(dim === "w" ? n : width, dim === "h" ? n : height);
  };
  return (
    <div className="resolution-inputs">
      {stage.mode === "square" ? (
        <label>
          n × n
          <input
            aria-label="正方形边长 n"
            max={64}
            min={2}
            onChange={(e) => setDim("w", e.target.value)}
            type="number"
            value={width}
          />
        </label>
      ) : (
        <>
          <label>
            宽
            <input
              aria-label="宽度（列数）"
              max={64}
              min={2}
              onChange={(e) => setDim("w", e.target.value)}
              type="number"
              value={width}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            高
            <input
              aria-label="高度（行数）"
              max={64}
              min={2}
              onChange={(e) => setDim("h", e.target.value)}
              type="number"
              value={height}
            />
          </label>
        </>
      )}
      <span className="cell-count">
        {SOURCE_SIZE * SOURCE_SIZE} 个位置 → {width * height} 个格子（保留{" "}
        {((width * height * 100) / (SOURCE_SIZE * SOURCE_SIZE)).toFixed(1)}%）
      </span>
    </div>
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

export function DownsampleExplorer({
  stage,
  width,
  height,
  selectedCell,
  onResolution,
  onCellPick,
  resolutionReady,
  ruleCode,
  shareSearch,
}: ExplorerProps) {
  const gallery = useMemo(() => publicGalleryFor(stage.category), [stage.category]);
  const [memberIndex, setMemberIndex] = useState(0);
  const member = gallery[Math.min(memberIndex, gallery.length - 1)];
  const [inspectedPairId, setInspectedPairId] = useState<string | null>(null);
  const [useMyRule, setUseMyRule] = useState(false);
  const [preview, setPreview] = useState<{
    source: BinaryImage;
    code: string;
    grid: BinaryImage | null;
    invalid: Set<number>;
    error: string | null;
  } | null>(null);
  const customCode = !stage.requiresChooseSize && useMyRule ? ruleCode?.trim() : undefined;

  const builtinCompressed = useMemo(
    () => downsample(member.image, width, height),
    [member, width, height],
  );

  // Run the student's cell_value over every cell of the displayed member.
  useEffect(() => {
    if (!customCode) return;
    let current = true;
    const timer = setTimeout(() => {
      void runCellValue(customCode, allRegions(member.image, width, height))
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
            source: builtinCompressed,
            code: customCode,
            grid,
            invalid,
            error: invalid.size ? `有 ${invalid.size} 格没有返回 0 或 1，图中暂按 0 显示。` : null,
          });
        })
        .catch((err: unknown) => {
          if (current)
            setPreview({
              source: builtinCompressed,
              code: customCode,
              grid: null,
              invalid: new Set(),
              error: err instanceof Error ? err.message : String(err),
            });
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [customCode, member, width, height, builtinCompressed]);

  const activePreview =
    preview?.code === customCode && preview?.source === builtinCompressed ? preview : null;
  const compressed = activePreview?.grid ?? builtinCompressed;

  const sweep = useMemo(
    () =>
      stage.probes.map((probe: Resolution) => {
        const report = judgeResolution(gallery, gallery, probe.width, probe.height);
        return { ...probe, cells: probe.width * probe.height, report };
      }),
    [stage, gallery],
  );

  const pairs = useMemo(() => confusionPairs(gallery, width, height), [gallery, width, height]);

  const inspection = useMemo(() => {
    if (!selectedCell) return null;
    const bounds = cellBounds(
      member.image.width,
      member.image.height,
      width,
      height,
      selectedCell.cx,
      selectedCell.cy,
    );
    const { on, total } = cellStats(member.image, width, height, selectedCell.cx, selectedCell.cy);
    const region = cellRegion(member.image, width, height, selectedCell.cx, selectedCell.cy);
    return {
      bounds,
      on,
      total,
      region: imageFromLists(region),
      majority: builtinCompressed.cells[selectedCell.cy * width + selectedCell.cx],
      output: compressed.cells[selectedCell.cy * width + selectedCell.cx],
    };
  }, [member, width, height, selectedCell, compressed, builtinCompressed]);

  /** A clicked confusion pair: member A shown, diff bbox outlined on the source. */
  const inspectedPair = useMemo(() => {
    if (!inspectedPairId) return null;
    const pair = pairs.find((p) => `${p.aId}-${p.bId}` === inspectedPairId);
    if (!pair) return null;
    const a = gallery.find((e) => e.id === pair.aId);
    const b = gallery.find((e) => e.id === pair.bId);
    if (!a || !b) return null;
    return { pair, a, b, bounds: diffBounds(a.image, b.image) };
  }, [inspectedPairId, pairs, gallery]);

  const sourceRegion = inspectedPair?.bounds ?? inspection?.bounds ?? null;

  const pickMember = (index: number) => {
    setMemberIndex(index);
    setInspectedPairId(null);
    onCellPick(null);
  };

  const inspectPair = (pairKey: string, aId: string) => {
    const index = gallery.findIndex((e) => e.id === aId);
    if (index >= 0) setMemberIndex(index);
    setInspectedPairId(pairKey);
    onCellPick(null);
  };

  return (
    <section aria-labelledby="explorer-title" className="downsample-explorer">
      <h3 id="explorer-title">发信实验台（公开图谱 {gallery.length} 张）</h3>
      {shareSearch ? <ScenarioLinkButton search={shareSearch} /> : null}

      <ResolutionInputs
        height={height}
        onResolution={onResolution}
        resolutionReady={resolutionReady}
        stage={stage}
        width={width}
      />

      {!stage.requiresChooseSize && ruleCode?.trim() ? (
        <div aria-label="预览使用的规则" className="rule-toggle" role="group">
          <span>接收端规则：</span>
          <button
            aria-pressed={!useMyRule}
            className={!useMyRule ? "is-active" : ""}
            onClick={() => setUseMyRule(false)}
            type="button"
          >
            内置多数规则
          </button>
          <button
            aria-pressed={useMyRule}
            className={useMyRule ? "is-active" : ""}
            onClick={() => setUseMyRule(true)}
            type="button"
          >
            我写的 cell_value
          </button>
          {customCode && !activePreview ? <span className="rule-running">运行中…</span> : null}
        </div>
      ) : null}
      {activePreview?.error ? (
        <p className="rule-error" role="alert">
          {activePreview.error}
          {activePreview.grid ? "" : "（预览暂用内置规则）"}
        </p>
      ) : null}

      <div className="explorer-columns">
        <div className="explorer-left">
          <div aria-label="选择要发送的信号" className="member-strip" role="listbox">
            {gallery.map((entry, index) => (
              <button
                aria-label={`查看 ${entry.label}`}
                aria-selected={index === memberIndex}
                className={`member-chip${index === memberIndex ? " is-active" : ""}`}
                key={entry.id}
                onClick={() => pickMember(index)}
                role="option"
                type="button"
              >
                <BitmapCanvas ariaLabel={entry.label} image={entry.image} pixelSize={2} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          <table className="sweep-table">
            <caption>按内置多数规则，各分辨率能分清多少张</caption>
            <thead>
              <tr>
                <th>分辨率</th>
                <th>格子数</th>
                <th>可辨认</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((row) => {
                const active = row.width === width && row.height === height;
                return (
                  <tr className={active ? "is-active" : ""} key={`${row.width}x${row.height}`}>
                    <td>
                      {stage.requiresChooseSize ? (
                        <span>
                          {row.width}×{row.height}
                        </span>
                      ) : (
                        <button
                          className="probe-link"
                          onClick={() =>
                            onResolution(
                              row.width,
                              stage.mode === "square" ? row.width : row.height,
                            )
                          }
                          type="button"
                        >
                          {row.width}×{row.height}
                        </button>
                      )}
                    </td>
                    <td>{row.cells}</td>
                    <td>
                      {row.report.identified} / {row.report.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pairs.length > 0 ? (
            <div className="confusion-callout" role="note">
              <strong>
                按内置规则，{width}×{height} 时有 {pairs.length} 对会撞脸：
              </strong>
              <ul>
                {pairs.slice(0, 5).map((pair) => {
                  const key = `${pair.aId}-${pair.bId}`;
                  return (
                    <li key={key}>
                      <button
                        className={`pair-link${inspectedPairId === key ? " is-active" : ""}`}
                        onClick={() => inspectPair(key, pair.aId)}
                        type="button"
                      >
                        {pair.aLabel} ≡ {pair.bLabel}
                      </button>
                    </li>
                  );
                })}
                {pairs.length > 5 ? <li>…还有 {pairs.length - 5} 对</li> : null}
              </ul>
              {inspectedPair ? (
                <p className="pair-diff-note">
                  {inspectedPair.bounds
                    ? `${inspectedPair.pair.aLabel} 与 ${inspectedPair.pair.bLabel} 的差别只在原图 x∈[${inspectedPair.bounds.x0}, ${inspectedPair.bounds.x1})、y∈[${inspectedPair.bounds.y0}, ${inspectedPair.bounds.y1}) 的 ${inspectedPair.bounds.pixels} 个像素里（原图上的虚线框）——当前网格把它抹平了。`
                    : `${inspectedPair.pair.aLabel} 与 ${inspectedPair.pair.bLabel} 原图完全相同。`}
                </p>
              ) : (
                <p className="pair-diff-note">点一对，看它们的差别被哪个区域的格子抹掉了。</p>
              )}
            </div>
          ) : (
            <p className="confusion-clear">按内置规则，当前分辨率能分清图谱里的每一张。</p>
          )}
        </div>

        <div className="explorer-right">
          <div className="preview-pair">
            <figure>
              <BitmapCanvas
                ariaLabel={`原图 ${member.label}`}
                image={member.image}
                region={sourceRegion}
              />
              <figcaption>
                发送端原图 {member.label} · {member.image.width}×{member.image.height}
              </figcaption>
            </figure>
            <span aria-hidden="true" className="preview-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <figure>
              <BitmapCanvas
                ariaLabel={`接收端看到的 ${width}×${height} 格子图`}
                grid
                highlight={selectedCell}
                image={compressed}
                onCellClick={(cx, cy) => {
                  setInspectedPairId(null);
                  onCellPick(
                    selectedCell && selectedCell.cx === cx && selectedCell.cy === cy
                      ? null
                      : { cx, cy },
                  );
                }}
              />
              <figcaption>
                接收端所见 {width}×{height}
                {activePreview?.grid ? " · 你的规则" : " · 内置多数规则"}
              </figcaption>
            </figure>
          </div>

          {inspection ? (
            <div className="cell-inspector" role="status">
              <BitmapCanvas
                ariaLabel="选中格子覆盖的原图像素"
                image={inspection.region}
                pixelSize={Math.max(
                  2,
                  Math.floor(80 / Math.max(inspection.region.width, inspection.region.height)),
                )}
                grid
              />
              <div>
                <strong>
                  格子 ({selectedCell!.cx}, {selectedCell!.cy})
                </strong>
                <p>
                  原图第 {inspection.bounds.x0}–{inspection.bounds.x1 - 1} 列，第{" "}
                  {inspection.bounds.y0}–{inspection.bounds.y1 - 1} 行（从 0 数）。
                </p>
                <p>
                  黑色占 {inspection.on} / {inspection.total}，
                  {inspection.on * 2 === inspection.total
                    ? "刚好一半"
                    : inspection.majority
                      ? "超过一半"
                      : "不到一半"}
                  。内置规则发 <strong>{inspection.majority}</strong>。
                </p>
                {activePreview?.grid ? (
                  <p>
                    {activePreview.invalid.has(selectedCell!.cy * width + selectedCell!.cx) ? (
                      "你的规则在这一格返回了无效值，暂按 0 显示。"
                    ) : (
                      <>
                        你的规则发 <strong>{inspection.output}</strong>。
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="cell-inspector-hint">
              点接收端任一格，数数它盖住了多少黑色像素。用键盘时，聚焦格子图后按方向键探索。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
