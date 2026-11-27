/**
 * Pixel-faithful canvas renderer for a BinaryImage. Optional cell grid, one
 * highlighted output cell, one highlighted source region, and click-to-pick
 * cell reporting for the zoom inspector.
 */

import { createEffect } from "solid-js";
import type { BinaryImage } from "../domain/bitmap.ts";

export type CellRect = { x0: number; y0: number; x1: number; y1: number };

type BitmapCanvasProps = {
  image: BinaryImage;
  /** CSS px per cell; default scales the image into a ~176px box. */
  pixelSize?: number;
  /** Draw grid lines between cells, optionally stronger for projection. */
  grid?: boolean | "strong";
  /** Highlight one cell of this image (accent outline). */
  highlight?: { cx: number; cy: number } | null;
  /** Highlight a pixel-space region (dashed outline) — for the source view. */
  region?: CellRect | null;
  onCellClick?: (cx: number, cy: number) => void;
  ariaLabel?: string;
  ariaDescribedBy?: string;
};

export function BitmapCanvas(props: BitmapCanvasProps) {
  let canvasEl: HTMLCanvasElement | undefined;
  const px = () =>
    props.pixelSize ??
    Math.max(2, Math.round(176 / Math.max(props.image.width, props.image.height)));

  createEffect(
    () => ({
      image: props.image,
      px: px(),
      grid: props.grid ?? false,
      highlight: props.highlight ?? null,
      region: props.region ?? null,
    }),
    ({ image, px: cellPx, grid, highlight, region }) => {
      const canvas = canvasEl;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = image.width * cellPx;
      canvas.height = image.height * cellPx;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          ctx.fillStyle = image.cells[y * image.width + x] ? "#1c2430" : "#f8fafc";
          ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
        }
      }
      if (grid && cellPx >= 4) {
        const strong = grid === "strong";
        ctx.strokeStyle = strong ? "#7c8898" : "rgba(90, 108, 128, 0.35)";
        ctx.lineWidth = strong ? 2 : 1;
        const offset = strong ? 0 : 0.5;
        ctx.beginPath();
        for (let x = 1; x < image.width; x += 1) {
          ctx.moveTo(x * cellPx + offset, 0);
          ctx.lineTo(x * cellPx + offset, canvas.height);
        }
        for (let y = 1; y < image.height; y += 1) {
          ctx.moveTo(0, y * cellPx + offset);
          ctx.lineTo(canvas.width, y * cellPx + offset);
        }
        ctx.stroke();
      }
      if (region) {
        ctx.save();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          region.x0 * cellPx + 1,
          region.y0 * cellPx + 1,
          (region.x1 - region.x0) * cellPx - 2,
          (region.y1 - region.y0) * cellPx - 2,
        );
        ctx.restore();
      }
      if (highlight) {
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = grid === "strong" ? 4 : 2;
        const inset = ctx.lineWidth / 2;
        ctx.strokeRect(
          highlight.cx * cellPx + inset,
          highlight.cy * cellPx + inset,
          cellPx - 2 * inset,
          cellPx - 2 * inset,
        );
      }
    },
  );

  return (
    <canvas
      aria-describedby={props.ariaDescribedBy}
      aria-label={props.ariaLabel}
      class="bitmap-canvas"
      onClick={
        props.onCellClick
          ? (event) => {
              const handler = props.onCellClick;
              if (!handler) return;
              const image = props.image;
              const rect = event.currentTarget.getBoundingClientRect();
              const cx = Math.floor(((event.clientX - rect.left) / rect.width) * image.width);
              const cy = Math.floor(((event.clientY - rect.top) / rect.height) * image.height);
              if (cx >= 0 && cy >= 0 && cx < image.width && cy < image.height) {
                handler(cx, cy);
              }
            }
          : undefined
      }
      onKeyDown={
        props.onCellClick
          ? (event) => {
              const handler = props.onCellClick;
              if (!handler) return;
              const highlight = props.highlight ?? null;
              const image = props.image;
              const column = highlight?.cx ?? 0;
              const row = highlight?.cy ?? 0;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handler(column, row);
                return;
              }
              const offsets: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const step = offsets[event.key];
              if (!step) return;
              event.preventDefault();
              const nextColumn = Math.max(0, Math.min(image.width - 1, column + step[0]));
              const nextRow = Math.max(0, Math.min(image.height - 1, row + step[1]));
              if (!highlight || column !== nextColumn || row !== nextRow) {
                handler(nextColumn, nextRow);
              }
            }
          : undefined
      }
      ref={(el) => {
        canvasEl = el;
      }}
      role={props.onCellClick ? "button" : "img"}
      style={{ "image-rendering": "pixelated" }}
      tabindex={props.onCellClick ? 0 : undefined}
    />
  );
}
