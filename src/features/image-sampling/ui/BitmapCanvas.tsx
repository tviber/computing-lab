/**
 * Pixel-faithful canvas renderer for a BinaryImage. Optional cell grid, one
 * highlighted output cell, one highlighted source region, and click-to-pick
 * cell reporting for the zoom inspector.
 */

import { useEffect, useRef } from "react";
import type { BinaryImage } from "../domain/bitmap.ts";

export type CellRect = { x0: number; y0: number; x1: number; y1: number };

type BitmapCanvasProps = {
  image: BinaryImage;
  /** CSS px per cell; default scales the image into a ~176px box. */
  pixelSize?: number;
  /** Draw thin grid lines between cells. */
  grid?: boolean;
  /** Highlight one cell of this image (accent outline). */
  highlight?: { cx: number; cy: number } | null;
  /** Highlight a pixel-space region (dashed outline) — for the source view. */
  region?: CellRect | null;
  onCellClick?: (cx: number, cy: number) => void;
  ariaLabel?: string;
};

export function BitmapCanvas({
  image,
  pixelSize,
  grid = false,
  highlight = null,
  region = null,
  onCellClick,
  ariaLabel,
}: BitmapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = pixelSize ?? Math.max(2, Math.round(176 / Math.max(image.width, image.height)));

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = image.width * px;
    canvas.height = image.height * px;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        ctx.fillStyle = image.cells[y * image.width + x] ? "#1c2430" : "#f8fafc";
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
    if (grid && px >= 4) {
      ctx.strokeStyle = "rgba(90, 108, 128, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < image.width; x += 1) {
        ctx.moveTo(x * px + 0.5, 0);
        ctx.lineTo(x * px + 0.5, canvas.height);
      }
      for (let y = 1; y < image.height; y += 1) {
        ctx.moveTo(0, y * px + 0.5);
        ctx.lineTo(canvas.width, y * px + 0.5);
      }
      ctx.stroke();
    }
    if (region) {
      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        region.x0 * px + 1,
        region.y0 * px + 1,
        (region.x1 - region.x0) * px - 2,
        (region.y1 - region.y0) * px - 2,
      );
      ctx.restore();
    }
    if (highlight) {
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.strokeRect(highlight.cx * px + 1, highlight.cy * px + 1, px - 2, px - 2);
    }
  }, [image, px, grid, highlight, region]);

  return (
    <canvas
      aria-label={ariaLabel}
      className="bitmap-canvas"
      onClick={
        onCellClick
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const cx = Math.floor(((event.clientX - rect.left) / rect.width) * image.width);
              const cy = Math.floor(((event.clientY - rect.top) / rect.height) * image.height);
              if (cx >= 0 && cy >= 0 && cx < image.width && cy < image.height) {
                onCellClick(cx, cy);
              }
            }
          : undefined
      }
      ref={ref}
      role={onCellClick ? "button" : "img"}
      tabIndex={onCellClick ? 0 : undefined}
      onKeyDown={
        onCellClick
          ? (event) => {
              const column = highlight?.cx ?? 0;
              const row = highlight?.cy ?? 0;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCellClick(column, row);
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
              if (!highlight || column !== nextColumn || row !== nextRow)
                onCellClick(nextColumn, nextRow);
            }
          : undefined
      }
      style={{ imageRendering: "pixelated" }}
    />
  );
}
