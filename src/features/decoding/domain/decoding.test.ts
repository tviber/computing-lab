import { describe, expect, it } from "vitest";
import {
  BMP_PROFILE,
  checkBmpHeightReading,
  decodeBmp,
  decodeRawPixels,
  encodeBmp,
  encodeRawPixels,
  type PixelMatrix,
} from "./bmp.ts";
import { bitsToByte, byteToBits, bytesToBitGroups, decodeText, encodeText } from "./encoding.ts";
import { extractChannelMessage, generatePayload, hiddenMessageOf } from "./payload.ts";
import { seedFor } from "./rng.ts";
import { DECODING_STAGES, getDecodingStage } from "./stages.ts";
import { checkText, sanitizePixels, verifyArtifact } from "./verify.ts";

/** 4×2 — the lab profile needs width*3 % 4 === 0, so a plain 2-wide won't encode. */
const PIXELS: PixelMatrix = [
  [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ],
  [
    [0, 0, 255],
    [255, 255, 255],
    [10, 20, 30],
    [40, 50, 60],
  ],
];

describe("encoding", () => {
  it("round-trips text through codes", () => {
    expect(decodeText(encodeText("HELLO WORLD"))).toBe("HELLO WORLD");
    expect(encodeText("A")).toEqual([65]);
    expect(encodeText(" ")).toEqual([32]);
  });

  it("round-trips bytes through bit groups", () => {
    expect(byteToBits(65)).toBe("01000001");
    expect(byteToBits(0)).toBe("00000000");
    expect(bitsToByte("01000001")).toBe(65);
    expect(bitsToByte(byteToBits(200))).toBe(200);
    expect(bytesToBitGroups([72, 73])).toEqual(["01001000", "01001001"]);
  });
});

describe("bmp", () => {
  it("writes the constrained header: BM signature, 54-byte offset, 24bpp", () => {
    const bytes = encodeBmp(PIXELS);
    expect(bytes[0]).toBe(66); // 'B'
    expect(bytes[1]).toBe(77); // 'M'
    expect(bytes[10]).toBe(54);
    expect(bytes[14]).toBe(40); // DIB header size
    expect(bytes[18]).toBe(4); // width
    expect(bytes[22]).toBe(2); // height
    expect(bytes[26]).toBe(1); // planes
    expect(bytes[28]).toBe(24); // bpp
    expect(bytes.length).toBe(BMP_PROFILE.pixelOffset + 4 * 2 * 3);
  });

  it("stores rows bottom-up as BGR triples", () => {
    const bytes = encodeBmp(PIXELS);
    // Bottom row first: [0,0,255] [255,255,255] [10,20,30] [40,50,60] as B,G,R.
    expect(bytes.slice(54, 66)).toEqual([255, 0, 0, 255, 255, 255, 30, 20, 10, 60, 50, 40]);
    // Then the top row.
    expect(bytes.slice(66, 78)).toEqual([0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255]);
  });

  it("round-trips pixels through encode/decode", () => {
    expect(decodeBmp(encodeBmp(PIXELS))).toEqual(PIXELS);
  });

  it("refuses widths that would need row padding", () => {
    const odd: PixelMatrix = [[[1, 2, 3]]]; // 1×1 → row = 3 bytes, needs padding
    expect(() => encodeBmp(odd)).toThrow();
  });

  it("round-trips raw RGB triples (the stage-4 decoder rule)", () => {
    const raw = encodeRawPixels(PIXELS);
    expect(raw.length).toBe(4 * 2 * 3);
    expect(raw.slice(0, 6)).toEqual([255, 0, 0, 0, 255, 0]);
    expect(decodeRawPixels(raw, 4, 2)).toEqual(PIXELS);
  });
});

describe("BMP height reading", () => {
  const square = encodeBmp(Array.from({ length: 4 }, () => PIXELS[0]));

  it("requires the height field even when width and height store the same value", () => {
    expect(checkBmpHeightReading(square, null, "4")).toBe("pick-start");
    expect(checkBmpHeightReading(square, 18, "4")).toBe("picked-width");
    expect(checkBmpHeightReading(square, 23, "4")).toBe("wrong-start");
    expect(checkBmpHeightReading(square, 22, "4")).toBe("correct");
  });

  it("reads the whole little-endian field from the supplied BMP", () => {
    const tall = encodeBmp(Array.from({ length: 258 }, () => PIXELS[0]));
    expect(checkBmpHeightReading(tall, 22, "2")).toBe("wrong-height");
    expect(checkBmpHeightReading(tall, 22, "258")).toBe("correct");
  });

  it("rejects empty, non-decimal and non-positive row counts", () => {
    for (const answer of ["", "  ", "-4", "0", "4.5", "0x4", "4e0"]) {
      expect(checkBmpHeightReading(square, 22, answer)).toBe("enter-height");
    }
  });
});

describe("payload generation", () => {
  it("is deterministic for the same seed", () => {
    for (const stage of DECODING_STAGES) {
      const a = generatePayload(stage, 12345);
      const b = generatePayload(stage, 12345);
      expect(a.payload).toEqual(b.payload);
      expect(a.expected).toEqual(b.expected);
    }
  });

  it("uses distinct stable seeds for different users", () => {
    const seedA = seedFor("user-a", "decoding", 1);
    const seedB = seedFor("user-b", "decoding", 1);
    expect(seedA).not.toBe(seedB);
  });

  it("keeps payload and expected consistent per stage", () => {
    for (const stage of DECODING_STAGES) {
      const { payload, expected } = generatePayload(stage, 777);
      switch (stage.kind) {
        case "codes": {
          const p = payload as { codes: number[] };
          expect(decodeText(p.codes)).toBe((expected as { text: string }).text);
          break;
        }
        case "bits": {
          const p = payload as { groups: string[] };
          const text = decodeText(p.groups.map(bitsToByte));
          expect(text).toBe((expected as { text: string }).text);
          break;
        }
        case "bmp": {
          const p = payload as { bytes: number[] };
          expect(decodeBmp(p.bytes)).toEqual((expected as { pixels: PixelMatrix }).pixels);
          break;
        }
        case "bmp-script": {
          const p = payload as { bytes: number[] };
          expect(hiddenMessageOf(p.bytes)).toBe((expected as { text: string }).text);
          break;
        }
        case "files": {
          const p = payload as { files: { bytes: number[] }[] };
          const want = expected as {
            verdicts: { decoder: string; text?: string; pixels?: PixelMatrix }[];
          };
          want.verdicts.forEach((verdict, i) => {
            if (verdict.decoder === "text") {
              expect(decodeText(p.files[i].bytes)).toBe(verdict.text);
            } else {
              expect(decodeRawPixels(p.files[i].bytes, 8, 8)).toEqual(verdict.pixels);
            }
          });
          break;
        }
      }
    }
  });

  it("embeds a readable message in the X1 R-channel", () => {
    const stage = getDecodingStage(5)!;
    const { payload } = generatePayload(stage, 42);
    const bytes = (payload as { bytes: number[] }).bytes;
    const message = hiddenMessageOf(bytes);
    expect(message.length).toBeGreaterThan(3);
    // Round-trip: decodeBmp gives pixels, extraction recovers the message.
    expect(extractChannelMessage(decodeBmp(bytes))).toBe(message);
  });
});

describe("verify", () => {
  it("sanitizes pixel matrices", () => {
    expect(sanitizePixels(PIXELS)).toEqual(PIXELS);
    expect(sanitizePixels("nope")).toBeNull();
    expect(sanitizePixels([[[1, 2]]])).toBeNull(); // not a triple
    expect(sanitizePixels([[[300, 0, 0]]])).toBeNull(); // out of range
    expect(
      sanitizePixels([
        [[1, 2, 3]],
        [
          [4, 5, 6],
          [7, 8, 9],
        ],
      ]),
    ).toBeNull(); // ragged
  });

  it("fails a wrong text with the first mismatch position", () => {
    const verdict = checkText("HALLO", "HELLO");
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain("第 2 个字符不符");
  });

  it("does not leak the expected answer in failure details", () => {
    const verdict = checkText("XXXXX", "HELLO");
    expect(verdict.detail).not.toContain("HELLO");
  });

  it("names the decoder bug behind a wrong pixel matrix", () => {
    const stage = getDecodingStage(3)!;
    const { expected } = generatePayload(stage, 5);
    const want = (expected as { pixels: PixelMatrix }).pixels;

    // Missing pixels.reverse() → rows still bottom-up.
    const upsideDown = verifyArtifact(stage, { pixels: [...want].reverse() }, expected);
    expect(upsideDown[0].detail).toContain("上下颠倒");

    // Read as R,G,B instead of B,G,R → R↔B swapped.
    const swapped = want.map((row) => row.map(([r, g, b]) => [b, g, r]));
    expect(verifyArtifact(stage, { pixels: swapped }, expected)[0].detail).toContain("颜色反了");

    // i = (x * height + y) → transposed.
    const transposed = want[0].map((_, x) => want.map((row) => row[x]));
    expect(verifyArtifact(stage, { pixels: transposed }, expected)[0].detail).toContain(
      "行和列对调",
    );

    // Anything else falls back to the first mismatch position.
    const off = want.map((row, y) => row.map((px, x) => (y === 3 && x === 3 ? [0, 0, 0] : px)));
    expect(verifyArtifact(stage, { pixels: off }, expected)[0].detail).toContain(
      "第 4 行第 4 个像素不符",
    );
  });

  it("checks a files-stage verdict set per file", () => {
    const stage = getDecodingStage(4)!;
    const { expected } = generatePayload(stage, 9);
    const want = (expected as { verdicts: { decoder: string; text?: string }[] }).verdicts;
    // Correct decoders, correct artifacts → all parts pass.
    const parts = verifyArtifact(stage, { verdicts: want }, expected);
    expect(parts.every((p) => p.ok)).toBe(true);
    // Flip one decoder choice → that file's decoder part fails.
    const flipped = want.map((v, i) =>
      i === 0
        ? { ...v, decoder: v.decoder === "text" ? ("image" as const) : ("text" as const) }
        : v,
    );
    const bad = verifyArtifact(stage, { verdicts: flipped }, expected);
    expect(bad.find((p) => p.id === "file-0-decoder")?.ok).toBe(false);
  });
});
