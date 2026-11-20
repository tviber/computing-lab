import { getCell, imagesEqual, type BinaryImage } from "./bitmap.ts";
import { downsample } from "./downsample.ts";
import { publicGalleryFor } from "./fixtures.ts";

export const RECEIVER_GRID_SIZE = { coarse: 4, fine: 8 } as const;
export type ReceiverLevel = keyof typeof RECEIVER_GRID_SIZE;
export type ReceiverChoice = "a" | "b" | "both";
export type ReceiverCell = { cx: number; cy: number };

export function createReceiverRound(level: ReceiverLevel) {
  const gallery = publicGalleryFor("invader");
  const size = RECEIVER_GRID_SIZE[level];
  // V-00 and V-07 collide at 4×4 and separate at 8×8. V-07 is sent both times.
  const originals = { a: gallery[0].image, b: gallery[7].image };
  const grids = {
    a: downsample(originals.a, size, size),
    b: downsample(originals.b, size, size),
  };
  return { size, originals, grids, packet: grids.b };
}

export type ReceiverRound = ReturnType<typeof createReceiverRound>;

export function receiverCellValues(round: ReceiverRound, cell: ReceiverCell | null) {
  const inBounds = (value: number) => Number.isInteger(value) && value >= 0 && value < round.size;
  if (!cell || !inBounds(cell.cx) || !inBounds(cell.cy)) return null;
  const read = (image: BinaryImage) => getCell(image, cell.cx, cell.cy);
  return { packet: read(round.packet), a: read(round.grids.a), b: read(round.grids.b) };
}

export function checkReceiverAnswer(
  round: ReceiverRound,
  choice: ReceiverChoice | null,
  cell: ReceiverCell | null,
) {
  if (!choice) return "choose";
  if (choice === "both") {
    return imagesEqual(round.packet, round.grids.a) && imagesEqual(round.packet, round.grids.b)
      ? "collision"
      : "compare";
  }
  const values = receiverCellValues(round, cell);
  if (!values) return "point";
  if (values.a === values.b) return "same";
  return values[choice] === values.packet ? "proved" : "mismatch";
}
