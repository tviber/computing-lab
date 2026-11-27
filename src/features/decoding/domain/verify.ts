/**
 * Submission artifact checks — pure functions shared by the server judge and
 * the unit tests. Each check reports the first place the artifact diverges
 * from the reference decode without leaking the expected answer.
 */

import type { PixelMatrix } from "./bmp.ts";
import type { DecoderChoice, PartVerdict } from "./protocol.ts";
import type { DecodingStageDef } from "./stages.ts";

export type Expected =
  | { text: string }
  | { pixels: PixelMatrix }
  | { verdicts: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] };

// ---------- artifact sanitization (bounded, typed) ----------

export function sanitizeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 200) return null;
  return text;
}

export function sanitizePixels(raw: unknown): PixelMatrix | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) return null;
  const matrix: PixelMatrix = [];
  const width = Array.isArray(raw[0]) ? raw[0].length : 0;
  if (width === 0 || width > 64) return null;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== width) return null;
    const outRow: [number, number, number][] = [];
    for (const px of row) {
      if (
        !Array.isArray(px) ||
        px.length !== 3 ||
        !px.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
      ) {
        return null;
      }
      outRow.push([px[0], px[1], px[2]]);
    }
    matrix.push(outRow);
  }
  return matrix;
}

export function sanitizeVerdicts(
  raw: unknown,
): { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return null;
  const out: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { decoder, text, pixels } = entry as {
      decoder?: unknown;
      text?: unknown;
      pixels?: unknown;
    };
    if (decoder !== "text" && decoder !== "image") return null;
    const item: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } = { decoder };
    if (text !== undefined) {
      const t = sanitizeText(text);
      if (t === null) return null;
      item.text = t;
    }
    if (pixels !== undefined) {
      const p = sanitizePixels(pixels);
      if (p === null) return null;
      item.pixels = p;
    }
    out.push(item);
  }
  return out;
}

// ---------- comparisons ----------

function textDetail(actual: string, expected: string): string {
  if (actual.length !== expected.length) {
    return `长度不符：提交了 ${actual.length} 个字符，应有 ${expected.length} 个`;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) return `第 ${i + 1} 个字符不符`;
  }
  return "";
}

function pixelsEqual(a: PixelMatrix, b: PixelMatrix): boolean {
  if (a.length !== b.length || a[0]?.length !== b[0]?.length) return false;
  return a.every((row, y) => row.every((px, x) => px.every((v, c) => v === b[y][x][c])));
}

/** R↔B channel swap — reading bytes as R,G,B instead of B,G,R. */
const swapChannels = (p: PixelMatrix): PixelMatrix =>
  p.map((row) => row.map(([r, g, b]) => [b, g, r] as (typeof row)[number]));
/** Bottom-up still stored as top-down — the missing pixels.reverse(). */
const flipRows = (p: PixelMatrix): PixelMatrix => [...p].reverse();
/** Row/column transpose — i = (x * height + y) instead of (y * width + x). */
const transpose = (p: PixelMatrix): PixelMatrix => p[0].map((_, x) => p.map((row) => row[x]));

/**
 * Name the common decoder bug that produced this matrix before falling back
 * to the first-mismatch position — "how it's wrong" beats "where it's wrong".
 */
function pixelsDetail(
  actual: PixelMatrix,
  expected: PixelMatrix,
  /** Storage convention worth naming when the image flips — top-down files
   * have no such convention to point at. */
  flipHint = "核对像素行的排列顺序",
): string {
  if (actual.length !== expected.length || actual[0]?.length !== expected[0]?.length) {
    return `尺寸不符：提交了 ${actual[0]?.length ?? 0}×${actual.length}，应是 ${expected[0]?.length ?? 0}×${expected.length}`;
  }
  if (pixelsEqual(actual, expected)) return "";
  if (pixelsEqual(flipRows(actual), expected)) {
    return `画面上下颠倒了。${flipHint}`;
  }
  if (pixelsEqual(swapChannels(actual), expected)) {
    return "形状对了但颜色反了，核对 B、G、R 的通道顺序";
  }
  if (pixelsEqual(transpose(actual), expected)) {
    return "行和列对调了，检查像素位置是 (y * width + x)";
  }
  for (let y = 0; y < expected.length; y += 1) {
    for (let x = 0; x < expected[y].length; x += 1) {
      const a = actual[y][x];
      const e = expected[y][x];
      if (a[0] !== e[0] || a[1] !== e[1] || a[2] !== e[2]) {
        return `第 ${y + 1} 行第 ${x + 1} 个像素不符`;
      }
    }
  }
  return "";
}

export function checkText(actual: string, expected: string, label = "解码出的文本"): PartVerdict {
  const detail = textDetail(actual, expected);
  return { id: "text", label, ok: detail === "", detail: detail || null };
}

export function checkPixels(
  actual: PixelMatrix,
  expected: PixelMatrix,
  flipHint?: string,
): PartVerdict {
  const detail = pixelsDetail(actual, expected, flipHint);
  return { id: "pixels", label: "像素矩阵", ok: detail === "", detail: detail || null };
}

/**
 * Verify a submission artifact against the reference answer generated with
 * the payload. Returns one verdict per checked part; a stage passes when
 * every part is ok.
 */
export function verifyArtifact(
  stage: DecodingStageDef,
  artifact: unknown,
  expected: Expected,
): PartVerdict[] {
  switch (stage.kind) {
    case "codes":
    case "bits":
    case "bmp-script": {
      const text = sanitizeText((artifact as { text?: unknown })?.text);
      if (text === null)
        return [{ id: "text", label: "解码出的文本", ok: false, detail: "格式不符" }];
      return [checkText(text, (expected as { text: string }).text)];
    }
    case "bmp": {
      const parts: PartVerdict[] = [];
      const exp = expected as { pixels: PixelMatrix };
      const pixels = sanitizePixels((artifact as { pixels?: unknown })?.pixels);
      if (pixels === null) {
        parts.push({ id: "pixels", label: "像素矩阵", ok: false, detail: "格式不符" });
      } else {
        parts.push(
          checkPixels(pixels, exp.pixels, "核对行序约定（BMP 里图像最下面一行存在最前面）"),
        );
      }
      return parts;
    }
    case "files": {
      const submitted = sanitizeVerdicts((artifact as { verdicts?: unknown })?.verdicts);
      const exp = (
        expected as { verdicts: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] }
      ).verdicts;
      if (submitted === null || submitted.length !== exp.length) {
        return exp.map((_, i) => ({
          id: `file-${i}`,
          label: `文件 ${i + 1}`,
          ok: false,
          detail: "判定不完整",
        }));
      }
      return exp.flatMap((want, i) => {
        const got = submitted[i];
        const parts: PartVerdict[] = [
          {
            id: `file-${i}-decoder`,
            label: `文件 ${i + 1} 的解释方式`,
            ok: got.decoder === want.decoder,
            detail: got.decoder === want.decoder ? null : "解码方式与这份文件说的内容不符",
          },
        ];
        if (got.decoder === want.decoder) {
          if (want.decoder === "text") {
            const text = got.text ?? "";
            const detail = want.text !== undefined ? textDetail(text, want.text) : "缺少文本结果";
            parts.push({
              id: `file-${i}-text`,
              label: `文件 ${i + 1} 的文本结果`,
              ok: detail === "",
              detail: detail || null,
            });
          } else {
            const detail =
              got.pixels !== undefined && want.pixels !== undefined
                ? pixelsDetail(got.pixels, want.pixels)
                : "缺少像素结果";
            parts.push({
              id: `file-${i}-pixels`,
              label: `文件 ${i + 1} 的像素结果`,
              ok: detail === "",
              detail: detail || null,
            });
          }
        }
        return parts;
      });
    }
  }
}
