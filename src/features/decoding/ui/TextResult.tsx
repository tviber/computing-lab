import type { DecodingStageDef } from "../domain/stages.ts";

/** The decoded text plus the code→char map that made it — the visible proof
 *  that a byte stream only means something under an agreed table. */
export function TextResult({ text, stage }: { text: string; stage: DecodingStageDef }) {
  const chars = [...text];
  return (
    <div className="run-result">
      <p className="run-result-label">decode(data) →</p>
      <p className="decoded-text">{text || "（空串）"}</p>
      {stage.kind === "codes" || stage.kind === "bits" ? (
        <ol
          aria-label="输出字符对应的编码"
          className={`decoded-map${stage.kind === "bits" ? " is-bits" : ""}`}
          role="list"
        >
          {chars.slice(0, 24).map((char, index) => {
            const code = char.codePointAt(0)!;
            return (
              <li key={index}>
                <span className="decoded-code">
                  {stage.kind === "bits" ? code.toString(2).padStart(8, "0") : code}
                </span>
                <span className="decoded-arrow">→</span>
                <span className="decoded-char">{char === " " ? "␣" : char}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {stage.kind === "codes" || stage.kind === "bits" ? (
        <p className="decoded-count">把输出字符的编码和原始数据比一比。␣ 表示空格。</p>
      ) : null}
    </div>
  );
}
