/**
 * Student-facing translation of raw Python/worker errors — the names a
 * beginner actually hits while filling blanks, each mapped to the check
 * that fixes it. The raw message stays appended for the teacher's sake.
 */

export function friendlyRunError(raw: string): string {
  const syntax = /SyntaxError:.*line (\d+)/.exec(raw);
  if (syntax) return `第 ${syntax[1]} 行附近语法写错了。检查括号、引号和冒号。（${raw}）`;
  if (/IndexError/.test(raw)) return `下标越界了。检查像素起点和位置计算。（${raw}）`;
  const name = /NameError: name '(\w+)' is not defined/.exec(raw);
  if (name) return `名字 ${name[1]} 没有定义过。检查是否拼错，或运行顺序放反了。（${raw}）`;
  if (/TypeError/.test(raw)) return `类型用错了。检查取到的是数还是列表。（${raw}）`;
  return raw;
}
