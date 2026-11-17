import { describe, expect, it } from "vitest";
import { imageFromRows, imagesEqual, imageToRows, makeImage } from "./bitmap.ts";
import { cellBounds, cellRegion, cellStats, downsample, sanitizeResolution } from "./downsample.ts";

describe("downsample (majority coverage)", () => {
  it("shrinks a 4×4 checker to a solid 2×2 (each cell is half-on)", () => {
    const image = imageFromRows(["1010", "0101", "1010", "0101"]);
    // every 2×2 cell contains two 1s of four → exactly half → rule is >= 50%
    expect(imageToRows(downsample(image, 2, 2))).toEqual(["11", "11"]);
  });

  it("a quarter-covered cell stays 0", () => {
    const image = imageFromRows(["1000", "0000", "0000", "0000"]);
    expect(imageToRows(downsample(image, 2, 2))).toEqual(["00", "00"]);
  });

  it("handles non-divisible targets with floor boundaries", () => {
    const image = makeImage(6, 6);
    // fill left half
    for (let y = 0; y < 6; y += 1) for (let x = 0; x < 3; x += 1) image.cells[y * 6 + x] = 1;
    // 6→4: columns cover [0,1),[1,3),[3,4),[4,6) — second cell is fully on
    const out = downsample(image, 4, 4);
    expect(imageToRows(out)[0]).toBe("1100");
  });

  it("identity at source resolution", () => {
    const image = imageFromRows(["101", "010", "111"]);
    expect(imagesEqual(downsample(image, 3, 3), image)).toBe(true);
  });

  it("cellStats and cellRegion agree on a cell", () => {
    const image = imageFromRows(["1100", "1100", "0000", "0011"]);
    const { on, total } = cellStats(image, 2, 2, 0, 0);
    expect(on).toBe(4);
    expect(total).toBe(4);
    expect(cellRegion(image, 2, 2, 0, 0)).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it("cellBounds partitions the source exactly", () => {
    // every source pixel must land in exactly one cell
    const seen = new Set<string>();
    for (let cy = 0; cy < 7; cy += 1) {
      for (let cx = 0; cx < 5; cx += 1) {
        const { x0, y0, x1, y1 } = cellBounds(64, 64, 5, 7, cx, cy);
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) seen.add(`${x},${y}`);
      }
    }
    expect(seen.size).toBe(64 * 64);
  });

  it("covers each source pixel exactly once across rectangular and non-divisor grids", () => {
    for (const [width, height] of [
      [2, 2],
      [7, 11],
      [11, 7],
      [13, 13],
      [64, 64],
    ]) {
      for (let w = 2; w <= Math.min(width, 8); w += 1) {
        for (let h = 2; h <= Math.min(height, 8); h += 1) {
          const visits = new Uint16Array(width * height);
          for (let cy = 0; cy < h; cy += 1) {
            for (let cx = 0; cx < w; cx += 1) {
              const { x0, y0, x1, y1 } = cellBounds(width, height, w, h, cx, cy);
              expect(x1).toBeGreaterThan(x0);
              expect(y1).toBeGreaterThan(y0);
              for (let y = y0; y < y1; y += 1) {
                for (let x = x0; x < x1; x += 1) visits[y * width + x] += 1;
              }
            }
          }
          expect(visits.every((count) => count === 1)).toBe(true);
        }
      }
    }
  });
});

describe("sanitizeResolution", () => {
  it("clamps into [2, 64] and rounds", () => {
    expect(sanitizeResolution({ width: 1, height: 200 })).toEqual({ width: 2, height: 64 });
    expect(sanitizeResolution({ width: 7.6, height: 3.2 })).toEqual({ width: 8, height: 3 });
  });
  it("rejects non-numbers and non-objects", () => {
    expect(sanitizeResolution(null)).toBeNull();
    expect(sanitizeResolution({ width: "x" })).toBeNull();
    expect(sanitizeResolution({ width: 0 })).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, "8", null, undefined, true, {}, []])(
    "rejects invalid dimensions in either position: %j",
    (dimension) => {
      expect(sanitizeResolution({ width: dimension, height: 8 })).toBeNull();
      expect(sanitizeResolution({ width: 8, height: dimension })).toBeNull();
    },
  );

  it("produces bounded integers and is idempotent across finite boundary values", () => {
    const values = [-Number.MAX_VALUE, -1, 0, 1.5, 2, 2.49, 2.5, 63.5, 64, 65, Number.MAX_VALUE];
    for (const width of values) {
      for (const height of values) {
        const result = sanitizeResolution({ width, height });
        expect(result).not.toBeNull();
        for (const value of Object.values(result!)) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(2);
          expect(value).toBeLessThanOrEqual(64);
        }
        expect(sanitizeResolution(result)).toEqual(result);
      }
    }
  });
});
