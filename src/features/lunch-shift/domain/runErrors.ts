/**
 * Student-facing error translation for the lunch-shift Pyodide runs:
 * raw Python/worker messages mapped to the check that fixes them, plus a
 * pre-run scan for full-width punctuation in real code (string literals
 * and comments are skipped — Chinese words inside word tables are legal).
 */

export function friendlyRunError(raw: string): string {
  const syntax = /SyntaxError:.*line (\d+)/.exec(raw);
  if (syntax) return `第 ${syntax[1]} 行附近语法写错了——检查括号、引号和冒号。（${raw}）`;
  const name = /NameError: name '(\w+)' is not defined/.exec(raw);
  if (name) return `${name[1]} 没有定义过——是不是拼错了，或者运行顺序放反了？（${raw}）`;
  if (/IndentationError/.test(raw)) return `缩进不对——函数体每行前面要留一样的空格。（${raw}）`;
  if (/TypeError/.test(raw)) return `类型用错了——检查每个名字里装的是词还是数。（${raw}）`;
  return raw;
}

const FULL_WIDTH = new Set(["“", "”", "‘", "’", "：", "，"]);

export type PunctuationHit = { line: number; ch: string };

/**
 * Find full-width punctuation outside string literals and comments. A tiny
 * lexer is enough: track quote state (including triple quotes), backslash
 * escapes and `#` comments; everything else is real code.
 */
export function findFullWidthPunctuation(code: string): PunctuationHit[] {
  const hits: PunctuationHit[] = [];
  let line = 1;
  let i = 0;
  const n = code.length;
  const quoteAt = (offset: number): string | null => {
    if (code.startsWith('"""', offset)) return '"""';
    if (code.startsWith("'''", offset)) return "'''";
    const ch = code[offset];
    return ch === '"' || ch === "'" ? ch : null;
  };
  while (i < n) {
    const ch = code[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === "#") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    const quote = quoteAt(i);
    if (quote) {
      i += quote.length;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code.startsWith(quote, i)) {
          i += quote.length;
          break;
        }
        if (code[i] === "\n") {
          line++;
          i++;
          if (quote.length === 1) break; // unterminated single-quoted string
          continue;
        }
        i++;
      }
      continue;
    }
    if (FULL_WIDTH.has(ch)) hits.push({ line, ch });
    i++;
  }
  return hits;
}

/** One student-readable sentence for the punctuation hits, or null. */
export function describeFullWidthPunctuation(code: string): string | null {
  const hits = findFullWidthPunctuation(code);
  if (hits.length === 0) return null;
  const first = hits[0];
  return `第 ${first.line} 行有中文标点「${first.ch}」——换成半角的符号（字符串里写中文词没问题）。`;
}
