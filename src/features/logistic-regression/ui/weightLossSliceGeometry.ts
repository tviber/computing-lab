import {
  clampSliceW,
  SLICE_MAX_W,
  SLICE_MIN_W,
  type SliceEval,
  type SliceStepDirection,
} from "../domain/lossSlice.ts";

export type TrailPoint = SliceEval & {
  deltaW: number | null;
  action: SliceStepDirection | "init";
};

export type ContextMode = "zero" | "trained";

export const SLICE_CHART_W = 540;
export const SLICE_CHART_H = 228;
export const SLICE_PAD_L = 48;
export const SLICE_PAD_R = 20;
export const SLICE_PAD_T = 20;
export const SLICE_PAD_B = 30;
export const SLICE_W_TICKS = [-4, -2, 0, 2, 4] as const;

/** Liang–Barsky line segment clipping against an axis-aligned rectangle. */
export function clipLineToBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): [number, number, number, number] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, x1 - xmin],
    [dx, xmax - x1],
    [-dy, y1 - ymin],
    [dy, ymax - y1],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

export function fmtSigned(val: number, digits = 3): string {
  const fixed = val.toFixed(digits);
  return val >= 0 ? `+${fixed}` : fixed;
}

export function xOfW(w: number): number {
  return (
    SLICE_PAD_L +
    ((clampSliceW(w) - SLICE_MIN_W) / (SLICE_MAX_W - SLICE_MIN_W)) *
      (SLICE_CHART_W - SLICE_PAD_L - SLICE_PAD_R)
  );
}

export function yOfLoss(loss: number, yMax: number): number {
  const clamped = Math.max(0, Math.min(yMax, loss));
  return (
    SLICE_CHART_H - SLICE_PAD_B - (clamped / yMax) * (SLICE_CHART_H - SLICE_PAD_T - SLICE_PAD_B)
  );
}

export function wFromClientX(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  fallbackW: number,
): number {
  if (rectWidth <= 0) return fallbackW;
  const svgX = ((clientX - rectLeft) / rectWidth) * SLICE_CHART_W;
  const ratio = (svgX - SLICE_PAD_L) / (SLICE_CHART_W - SLICE_PAD_L - SLICE_PAD_R);
  return clampSliceW(SLICE_MIN_W + ratio * (SLICE_MAX_W - SLICE_MIN_W));
}

export function buildTrailComparisonNote(trail: readonly TrailPoint[]): string | null {
  if (trail.length < 3) return null;
  const [p0, p1, p2] = trail.slice(-3);
  const d1 = p1.w - p0.w;
  const d2 = p2.w - p1.w;
  if (d1 * d2 < -1e-6) {
    const diff = p2.w - p0.w;
    return `来回对比：从 P${trail.length - 3} (${p0.w.toFixed(2)}) 跳到 P${trail.length - 2} (${p1.w.toFixed(2)}) 后再反向跳回 P${trail.length - 1} (${p2.w.toFixed(2)})，没有回到原位（相差 ${fmtSigned(diff)}），因为两处的坡度（偏导）不同（${fmtSigned(p0.grad)} vs ${fmtSigned(p1.grad)}）。`;
  }
  if (Math.abs(d1) > 1e-5 && Math.abs(d2) > 1e-5) {
    return `最近两步步幅：${Math.abs(d1).toFixed(3)} → ${Math.abs(d2).toFixed(3)}（${
      Math.abs(d2) < Math.abs(d1)
        ? "越靠近谷底坡度越缓，每格步幅自动收缩"
        : "进入更陡区域，坡度变大，每格步幅也跟着变大"
    }）。`;
  }
  return null;
}
