import { describe, expect, it } from "vitest";
import { makeImage } from "./bitmap.ts";
import { chamferSym, hamming } from "./match.ts";

describe("binary image distances", () => {
  it("preserves identity, symmetry and bounds for all pairs of 2×2 images", () => {
    const images = Array.from({ length: 16 }, (_, bits) => {
      const image = makeImage(2, 2);
      for (let i = 0; i < 4; i += 1) image.cells[i] = (bits >> i) & 1;
      return image;
    });
    for (const a of images) {
      expect(hamming(a, a)).toBe(0);
      expect(chamferSym(a, a)).toBe(0);
      for (const b of images) {
        const distance = hamming(a, b);
        expect(distance).toBe(hamming(b, a));
        expect(Number.isInteger(distance)).toBe(true);
        expect(distance).toBeGreaterThanOrEqual(0);
        expect(distance).toBeLessThanOrEqual(4);
        const chamfer = chamferSym(a, b);
        expect(chamfer).toBe(chamferSym(b, a));
        expect(chamfer).toBeGreaterThanOrEqual(0);
        expect(chamfer).toBeLessThanOrEqual(4);
      }
    }
  });

  it("uses squared Euclidean distance on rectangular images", () => {
    const a = makeImage(3, 2);
    const b = makeImage(3, 2);
    a.cells[0] = 1;
    b.cells[5] = 1;
    expect(chamferSym(a, b)).toBe(5);
    expect(hamming(a, b)).toBe(2);
    expect(chamferSym(a, makeImage(3, 2))).toBe(6.5);
  });

  it.each([hamming, chamferSym])(
    "rejects mismatched shapes even when cell counts are equal: %s",
    (distance) => {
      expect(() => distance(makeImage(2, 3), makeImage(3, 2))).toThrow(/equal dimensions/);
      expect(() => distance(makeImage(2, 2), makeImage(2, 3))).toThrow(/equal dimensions/);
    },
  );
});
