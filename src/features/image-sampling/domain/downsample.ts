/**
 * Majority-coverage downsampling — the one fixed rule of this lab.
 *
 * The source image is partitioned into w×h target cells; each cell turns on
 * iff at least half of the source pixels inside it are ink. Boundaries use
 * floor-binning (`y0 = cy*H/h`), so non-divisor target sizes stay
 * deterministic and cells differ in area by at most a row/column — that is
 * an honest property of the rule, not a bug.
 *
 * All integer math; identical results in browser and in the Node judge.
 */

import { makeImage, type BinaryImage } from "./bitmap.ts";

export type Resolution = { width: number; height: number };

export const MIN_RESOLUTION = 2;
export const MAX_RESOLUTION = 64;

/** Cell [cx,cy] of a w×h grid covers source rows [y0,y1) × cols [x0,x1). */
export function cellBounds(
  sourceWidth: number,
  sourceHeight: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor((cx * sourceWidth) / w),
    x1: Math.floor(((cx + 1) * sourceWidth) / w),
    y0: Math.floor((cy * sourceHeight) / h),
    y1: Math.floor(((cy + 1) * sourceHeight) / h),
  };
}

/** Ink pixels vs total pixels inside one target cell's source region. */
export function cellStats(
  image: BinaryImage,
  w: number,
  h: number,
  cx: number,
  cy: number,
): { on: number; total: number } {
  const { x0, y0, x1, y1 } = cellBounds(image.width, image.height, w, h, cx, cy);
  let on = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      on += image.cells[y * image.width + x];
    }
  }
  return { on, total: Math.max(1, (y1 - y0) * (x1 - x0)) };
}

export function downsample(image: BinaryImage, w: number, h: number): BinaryImage {
  const out = makeImage(w, h);
  for (let cy = 0; cy < h; cy += 1) {
    for (let cx = 0; cx < w; cx += 1) {
      const { on, total } = cellStats(image, w, h, cx, cy);
      out.cells[cy * w + cx] = 2 * on >= total ? 1 : 0;
    }
  }
  return out;
}

/** The source pixels of one target cell as a 2D 0/1 list (row-major rows). */
export function cellRegion(
  image: BinaryImage,
  w: number,
  h: number,
  cx: number,
  cy: number,
): number[][] {
  const { x0, y0, x1, y1 } = cellBounds(image.width, image.height, w, h, cx, cy);
  const rows: number[][] = [];
  for (let y = y0; y < y1; y += 1) {
    const row: number[] = [];
    for (let x = x0; x < x1; x += 1) row.push(image.cells[y * image.width + x]);
    rows.push(row);
  }
  return rows;
}

/**
 * Clamp a user-provided resolution into the legal domain. Returns null when
 * the value is not a pair of finite numbers; valid values are rounded and clamped.
 */
export function sanitizeResolution(raw: unknown): Resolution | null {
  if (!raw || typeof raw !== "object") return null;
  const { width, height } = raw as { width?: unknown; height?: unknown };
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const clamp = (v: number) => Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(v)));
  return { width: clamp(Number(width)), height: clamp(Number(height)) };
}
