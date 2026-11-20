import { describe, expect, it } from "vitest";
import { imagesEqual } from "./bitmap.ts";
import { cellStats, downsample } from "./downsample.ts";
import { publicGalleryFor } from "./fixtures.ts";
import {
  checkReceiverAnswer,
  createReceiverRound,
  receiverCellValues,
} from "./receiverExercise.ts";

describe("two-badge receiver exercise", () => {
  const gallery = publicGalleryFor("invader");

  it.each(["coarse", "fine"] as const)("sends the same public source at %s resolution", (level) => {
    const { size, originals, packet } = createReceiverRound(level);
    expect(originals.a).toBe(gallery.find((entry) => entry.label === "V-00")?.image);
    expect(originals.b).toBe(gallery.find((entry) => entry.label === "V-07")?.image);
    expect(imagesEqual(packet, downsample(originals.b, size, size))).toBe(true);
  });

  it("accepts both, and no single badge, after the 16-cell collision", () => {
    const round = createReceiverRound("coarse");
    expect(round.size).toBe(4);
    expect(checkReceiverAnswer(round, null, null)).toBe("choose");
    expect(checkReceiverAnswer(round, "both", null)).toBe("collision");
    for (let cy = 0; cy < round.size; cy++) {
      for (let cx = 0; cx < round.size; cx++) {
        expect(checkReceiverAnswer(round, "a", { cx, cy })).toBe("same");
        expect(checkReceiverAnswer(round, "b", { cx, cy })).toBe("same");
      }
    }
  });

  it("accepts every distinguishing fine cell and rejects every matching one", () => {
    const round = createReceiverRound("fine");
    expect(round.size).toBe(8);
    expect(checkReceiverAnswer(round, "both", null)).toBe("compare");
    let distinguishing = 0;
    for (const [index, bit] of round.packet.cells.entries()) {
      const cell = { cx: index % round.size, cy: Math.floor(index / round.size) };
      const differs = round.grids.a.cells[index] !== bit;
      if (differs) distinguishing++;
      expect(checkReceiverAnswer(round, "a", cell)).toBe(differs ? "mismatch" : "same");
      expect(checkReceiverAnswer(round, "b", cell)).toBe(differs ? "proved" : "same");
    }
    expect(distinguishing).toBeGreaterThan(1);
    expect(distinguishing).toBeLessThan(round.packet.cells.length);
  });

  it("keeps the real half-threshold witness at row 4, column 6", () => {
    const round = createReceiverRound("fine");
    const cell = { cx: 5, cy: 3 };
    expect(receiverCellValues(round, cell)).toEqual({ packet: 1, a: 0, b: 1 });
    expect(cellStats(round.originals.a, 8, 8, cell.cx, cell.cy)).toEqual({ on: 31, total: 64 });
    expect(cellStats(round.originals.b, 8, 8, cell.cx, cell.cy)).toEqual({ on: 32, total: 64 });
  });

  it.each([null, { cx: -1, cy: 0 }, { cx: 8, cy: 0 }, { cx: 5, cy: 3.5 }])(
    "requires a valid evidence cell for a single badge",
    (cell) => {
      const round = createReceiverRound("fine");
      expect(checkReceiverAnswer(round, "b", cell)).toBe("point");
    },
  );
});
