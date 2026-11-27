/**
 * Pixel-faithful canvas renderer for an RGB PixelMatrix — the decoded-image
 * preview. Same convention as the image-sampling BitmapCanvas: nearest-pixel
 * scaling, thin grid between cells when zoomed far enough.
 */

import { createEffect } from "solid-js";
import type { PixelHover, PixelMatrix } from "../domain/bmp.ts";

export type { PixelHover } from "../domain/bmp.ts";

export function PixelCanvas(props: {
  pixels: PixelMatrix;
  /** CSS px per cell; default scales the image into a ~200px box. */
  pixelSize?: number;
  grid?: boolean;
  ariaLabel?: string;
  /** When given, mismatched cells get a bright outline. */
  diffAgainst?: PixelMatrix;
  /** Called with the hovered cell (null on leave); enables the pixel inspector. */
  onPixelHover?: (hover: PixelHover | null) => void;
}) {
  let canvasEl: HTMLCanvasElement | undefined;
  const height = () => props.pixels.length;
  const width = () => props.pixels[0]?.length ?? 0;
  const px = () => props.pixelSize ?? Math.max(4, Math.round(200 / Math.max(width(), height())));

  createEffect(
    () => ({
      pixels: props.pixels,
      px: px(),
      grid: props.grid ?? true,
      width: width(),
      height: height(),
      diffAgainst: props.diffAgainst,
    }),
    ({ pixels, px: cellPx, grid, width: w, height: h, diffAgainst }) => {
      const canvas = canvasEl;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = w * cellPx;
      canvas.height = h * cellPx;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const [r, g, b] = pixels[y][x];
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
        }
      }
      if (diffAgainst) {
        ctx.strokeStyle = "rgba(220, 38, 38, 0.95)";
        ctx.lineWidth = Math.max(2, Math.round(cellPx / 10));
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const want = diffAgainst[y]?.[x];
            const [r, g, b] = pixels[y][x];
            if (!want || want[0] !== r || want[1] !== g || want[2] !== b) {
              ctx.strokeRect(x * cellPx + 1, y * cellPx + 1, cellPx - 2, cellPx - 2);
            }
          }
        }
      }
      if (grid && cellPx >= 6) {
        ctx.strokeStyle = "rgba(90, 108, 128, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 1; x < w; x += 1) {
          ctx.moveTo(x * cellPx + 0.5, 0);
          ctx.lineTo(x * cellPx + 0.5, canvas.height);
        }
        for (let y = 1; y < h; y += 1) {
          ctx.moveTo(0, y * cellPx + 0.5);
          ctx.lineTo(canvas.width, y * cellPx + 0.5);
        }
        ctx.stroke();
      }
    },
  );

  return (
    <canvas
      aria-label={props.ariaLabel}
      class="pixel-canvas"
      onMouseLeave={() => props.onPixelHover?.(null)}
      onMouseMove={(e) => {
        if (!props.onPixelHover) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * width());
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * height());
        const rgb = props.pixels[y]?.[x];
        props.onPixelHover(rgb ? { x, y, rgb } : null);
      }}
      ref={(el) => {
        canvasEl = el;
      }}
      role="img"
      style={{ "image-rendering": "pixelated" }}
    />
  );
}
