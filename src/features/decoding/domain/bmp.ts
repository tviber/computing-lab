/**
 * The lab's deliberately-constrained BMP profile. Real 24-bit uncompressed
 * BMP, but widths are chosen so width*3 is already a multiple of 4 — no row
 * padding ever appears. The point is "organize bytes into pixels", never BMP
 * spec trivia; fixtures and the judge share this exact profile.
 *
 *   format = BMP, compression = none, bitsPerPixel = 24
 *   pixelOffset = 54, channelOrder = BGR, rowOrder = bottom-up
 */

export type Pixel = [number, number, number];
/** Rows top-down, each pixel [r, g, b]. */
export type PixelMatrix = Pixel[][];

export const BMP_PROFILE = {
  signature: "BM",
  pixelOffset: 54,
  dibSize: 40,
  bitsPerPixel: 24,
  bytesPerPixel: 3,
  compression: 0,
} as const;

export const BMP_FIELD_OFFSETS = { pixelOffset: 10, width: 18, height: 22 } as const;

export type HeightReadingResult =
  "pick-start" | "picked-width" | "wrong-start" | "enter-height" | "wrong-height" | "correct";

function writeU32(bytes: number[], offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function readU32(bytes: readonly number[], offset: number): number {
  return (
    (bytes[offset] | 0) +
    ((bytes[offset + 1] | 0) << 8) +
    ((bytes[offset + 2] | 0) << 16) +
    ((bytes[offset + 3] | 0) << 24)
  );
}

export function checkBmpHeightReading(
  bytes: readonly number[],
  start: number | null,
  answer: string,
): HeightReadingResult {
  if (start === null) return "pick-start";
  if (start === BMP_FIELD_OFFSETS.width) return "picked-width";
  if (start !== BMP_FIELD_OFFSETS.height) return "wrong-start";
  const count = Number(answer);
  if (!/^\d+$/.test(answer.trim()) || !Number.isSafeInteger(count) || count < 1) {
    return "enter-height";
  }
  return count === readU32(bytes, start) ? "correct" : "wrong-height";
}

export function encodeBmp(pixels: PixelMatrix): number[] {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  if (width === 0 || height === 0) throw new Error("empty pixel matrix");
  if ((width * BMP_PROFILE.bytesPerPixel) % 4 !== 0) {
    throw new Error("width*3 must be a multiple of 4 for the lab BMP profile");
  }
  const imageSize = width * height * BMP_PROFILE.bytesPerPixel;
  const fileSize = BMP_PROFILE.pixelOffset + imageSize;
  const bytes = new Array<number>(fileSize).fill(0);

  // BITMAPFILEHEADER (14 bytes)
  bytes[0] = 66; // 'B'
  bytes[1] = 77; // 'M'
  writeU32(bytes, 2, fileSize);
  writeU32(bytes, BMP_FIELD_OFFSETS.pixelOffset, BMP_PROFILE.pixelOffset);

  // BITMAPINFOHEADER (40 bytes)
  writeU32(bytes, 14, BMP_PROFILE.dibSize);
  writeU32(bytes, BMP_FIELD_OFFSETS.width, width);
  writeU32(bytes, BMP_FIELD_OFFSETS.height, height);
  bytes[26] = 1;
  bytes[28] = BMP_PROFILE.bitsPerPixel;
  writeU32(bytes, 34, imageSize);

  let i = BMP_PROFILE.pixelOffset;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (const [r, g, b] of pixels[y]) {
      bytes[i] = b;
      bytes[i + 1] = g;
      bytes[i + 2] = r;
      i += 3;
    }
  }
  return bytes;
}

/**
 * Reference decoder for the constrained profile — same steps the student is
 * asked to write: skip the 54-byte header, walk pixels as B,G,R triples in
 * bottom-up order, and present them as top-down [r,g,b] rows.
 */
export function decodeBmp(bytes: readonly number[]): PixelMatrix {
  const width = readU32(bytes, BMP_FIELD_OFFSETS.width);
  const height = readU32(bytes, BMP_FIELD_OFFSETS.height);
  const offset = readU32(bytes, BMP_FIELD_OFFSETS.pixelOffset);
  const pixels: PixelMatrix = [];
  for (let y = 0; y < height; y += 1) {
    const row: Pixel[] = [];
    for (let x = 0; x < width; x += 1) {
      const i = offset + (y * width + x) * BMP_PROFILE.bytesPerPixel;
      row.push([bytes[i + 2], bytes[i + 1], bytes[i]]);
    }
    pixels.push(row);
  }
  pixels.reverse(); // file stores bottom row first → flip to top-down
  return pixels;
}

/** Raw-pixel variant for stage 4: bytes are R,G,B triples, rows top-down. */
export function encodeRawPixels(pixels: PixelMatrix): number[] {
  const out: number[] = [];
  for (const row of pixels) {
    for (const [r, g, b] of row) {
      out.push(r, g, b);
    }
  }
  return out;
}

export function decodeRawPixels(
  bytes: readonly number[],
  width: number,
  height: number,
): PixelMatrix {
  const pixels: PixelMatrix = [];
  for (let y = 0; y < height; y += 1) {
    const row: Pixel[] = [];
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      row.push([bytes[i], bytes[i + 1], bytes[i + 2]]);
    }
    pixels.push(row);
  }
  return pixels;
}

/** A hovered pixel cell — the inspector's readout coordinates. */
export type PixelHover = { x: number; y: number; rgb: Pixel };

/** Cell-wise difference over the union of both matrices' bounds — missing
 * cells count as different too, so a shrunken matrix can't report 0. */
export function pixelDiffCount(a: PixelMatrix, b: PixelMatrix): number {
  let n = 0;
  const height = Math.max(a.length, b.length);
  const width = Math.max(...a.map((r) => r.length), ...b.map((r) => r.length), 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const got = a[y]?.[x];
      const want = b[y]?.[x];
      if (!got || !want || got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) {
        n += 1;
      }
    }
  }
  return n;
}
