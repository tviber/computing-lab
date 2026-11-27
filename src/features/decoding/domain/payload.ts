/**
 * Per-user payload generation for every stage. Everything the student sees —
 * the cipher note, the bit string, the BMP, the mystery files — is derived
 * from one seed (`seedFor(userId, labId, stageIndex)`), so the server can
 * regenerate the identical payload at judge time and compare against the
 * reference decode produced here.
 */

import { decodeBmp, encodeBmp, encodeRawPixels, type PixelMatrix } from "./bmp.ts";
import {
  bytesToBitGroups,
  decodeText,
  encodeText,
  HIDDEN_MESSAGES,
  SENTENCES,
  WORDS,
} from "./encoding.ts";
import { makeRng } from "./rng.ts";
import { CAT_PALETTES, catPixels, SPRITE_SIZE, spritePixels } from "./sprites.ts";
import type { LabPayload } from "./protocol.ts";
import type { DecodingStageDef } from "./stages.ts";
import type { Expected } from "./verify.ts";

export type GeneratedPayload = {
  /** Wire-safe descriptor delivered to the client (via GET /project extras). */
  payload: LabPayload;
  /** The reference artifact the judge compares the submission against. */
  expected: Expected;
};

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every-other-pixel channel read (X1): R of flat pixel 0, 2, 4…, until 0. */
export function extractChannelMessage(pixels: PixelMatrix): string {
  const flat = pixels.flat();
  const codes: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const value = flat[i][0];
    if (value === 0) break;
    codes.push(value);
  }
  return decodeText(codes);
}

/** BMP stages decode the same cat glyph with a per-user palette — see sprites.ts. */
function makeBmpPayload(rng: () => number): {
  payload: LabPayload;
  expected: { pixels: PixelMatrix };
} {
  const pixels = catPixels(pick(rng, CAT_PALETTES));
  return {
    payload: {
      kind: "bmp",
      bytes: encodeBmp(pixels),
      width: SPRITE_SIZE,
      height: SPRITE_SIZE,
    },
    expected: { pixels },
  };
}

export function generatePayload(stage: DecodingStageDef, seed: number): GeneratedPayload {
  const rng = makeRng(seed);
  switch (stage.kind) {
    case "codes": {
      const word = pick(rng, WORDS);
      return {
        payload: { kind: "codes", codes: encodeText(word) },
        expected: { text: word },
      };
    }
    case "bits": {
      const sentence = pick(rng, SENTENCES);
      return {
        payload: { kind: "bits", groups: bytesToBitGroups(encodeText(sentence)) },
        expected: { text: sentence },
      };
    }
    case "bmp": {
      return makeBmpPayload(rng);
    }
    case "bmp-script": {
      // X1: the same cat as stage 3 (the mission says so), plus a message
      // written into the R channel of every other pixel, zero-terminated.
      const message = pick(rng, HIDDEN_MESSAGES);
      const pixels = catPixels(pick(rng, CAT_PALETTES));
      const flat = pixels.flat();
      const codes = encodeText(message);
      for (let slot = 0; slot < flat.length / 2; slot += 1) {
        flat[slot * 2][0] = slot < codes.length ? codes[slot] : 0;
      }
      return {
        payload: {
          kind: "bmp",
          bytes: encodeBmp(pixels),
          width: SPRITE_SIZE,
          height: SPRITE_SIZE,
        },
        expected: { text: message },
      };
    }
    case "files": {
      const sentence = pick(rng, SENTENCES);
      const imageA = spritePixels(rng);
      const imageB = spritePixels(rng, { asciiSafe: true });
      const entries = shuffle(rng, [
        {
          file: {
            id: "telegram",
            meta: "缴获的电文片段。封条备注：「按字符编码读，是一句话。」",
            bytes: encodeText(sentence),
          },
          verdict: { decoder: "text" as const, text: sentence },
        },
        {
          file: {
            id: "capture",
            meta: "采集卡导出的原始像素流。标签注明：8×8，按 R、G、B 排列。",
            bytes: encodeRawPixels(imageA),
          },
          verdict: { decoder: "image" as const, pixels: imageA },
        },
        {
          file: {
            id: "unregistered",
            meta: "来源未登记的片段。交接单上写着：「图像资料，8×8。」",
            bytes: encodeRawPixels(imageB),
          },
          verdict: { decoder: "image" as const, pixels: imageB },
        },
      ]);
      return {
        payload: { kind: "files", files: entries.map((e) => e.file) },
        expected: { verdicts: entries.map((e) => e.verdict) },
      };
    }
  }
}

/** Convenience for tests / previews: the hidden message inside an X1 BMP. */
export function hiddenMessageOf(bytes: number[]): string {
  return extractChannelMessage(decodeBmp(bytes));
}

/** The value the student's `decode(data)` receives for this stage's payload. */
export function runData(payload: LabPayload): unknown {
  switch (payload.kind) {
    case "codes":
      return payload.codes;
    case "bits":
      return payload.groups;
    case "bmp":
      return payload.bytes;
    case "files":
      return null;
  }
}
