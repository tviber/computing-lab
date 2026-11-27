/**
 * Pixel-faithful canvas renderer for an IndexedImage. Cells are painted via
 * the `colorOf` lookup — source artwork uses the ink palette, printed output
 * uses the toner palette — so the same component shows both sides of the
 * quantization step.
 */

import { createEffect } from "solid-js";
import type { IndexedImage } from "../domain/indexed.ts";

type PaletteCanvasProps = {
  image: IndexedImage;
  /** Cell index -> CSS color. */
  colorOf: (cell: number) => string;
  /** CSS px per cell; default scales the image into a ~176px box. */
  pixelSize?: number;
  /** Draw thin grid lines between cells. */
  grid?: boolean;
  ariaLabel?: string;
};

export function PaletteCanvas(props: PaletteCanvasProps) {
  let canvasEl: HTMLCanvasElement | undefined;
  const px = () =>
    props.pixelSize ??
    Math.max(2, Math.round(176 / Math.max(props.image.width, props.image.height)));

  createEffect(
    () => ({
      image: props.image,
      px: px(),
      grid: props.grid ?? false,
      colorOf: props.colorOf,
    }),
    ({ image, px: cellPx, grid, colorOf }) => {
      const canvas = canvasEl;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = image.width * cellPx;
      canvas.height = image.height * cellPx;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          ctx.fillStyle = colorOf(image.cells[y * image.width + x]);
          ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
        }
      }
      if (grid && cellPx >= 4) {
        ctx.strokeStyle = "rgba(90, 108, 128, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 1; x < image.width; x += 1) {
          ctx.moveTo(x * cellPx + 0.5, 0);
          ctx.lineTo(x * cellPx + 0.5, canvas.height);
        }
        for (let y = 1; y < image.height; y += 1) {
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
      class="quant-canvas"
      ref={(el) => {
        canvasEl = el;
      }}
      role="img"
      style={{ "image-rendering": "pixelated" }}
    />
  );
}
