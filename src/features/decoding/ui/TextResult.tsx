import { createMemo, For, Show } from "solid-js";
import type { DecodingStageDef } from "../domain/stages.ts";

/** The decoded text plus the code→char map that made it — the visible proof
 *  that a byte stream only means something under an agreed table. */
export function TextResult(props: { text: string; stage: DecodingStageDef }) {
  const chars = createMemo(() => [...props.text]);
  const isCodeStage = () => props.stage.kind === "codes" || props.stage.kind === "bits";

  return (
    <div class="run-result">
      <p class="run-result-label">decode(data) →</p>
      <p class="decoded-text">{props.text || "（空串）"}</p>
      <Show when={isCodeStage()}>
        <ol
          aria-label="输出字符对应的编码"
          class={`decoded-map${props.stage.kind === "bits" ? " is-bits" : ""}`}
          role="list"
        >
          <For each={chars().slice(0, 24)}>
            {(char) => {
              const code = char.codePointAt(0)!;
              return (
                <li>
                  <span class="decoded-code">
                    {props.stage.kind === "bits" ? code.toString(2).padStart(8, "0") : code}
                  </span>
                  <span class="decoded-arrow">→</span>
                  <span class="decoded-char">{char === " " ? "␣" : char}</span>
                </li>
              );
            }}
          </For>
        </ol>
        <p class="decoded-count">把输出字符的编码和原始数据比一比。␣ 表示空格。</p>
      </Show>
    </div>
  );
}
