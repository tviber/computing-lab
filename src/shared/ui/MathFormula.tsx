import type { JSX } from "@solidjs/web";
import { renderToString } from "katex";
import { createMemo, For, Show } from "solid-js";
import "katex/dist/katex.min.css";
import "./mathFormula.css";

export function MathFormula(props: { children: string; display?: boolean }) {
  const html = createMemo(() =>
    renderToString(props.children, {
      displayMode: props.display ?? false,
      output: "htmlAndMathml",
      fleqn: props.display ?? false,
      trust: false,
      throwOnError: false,
    }),
  );
  return (
    <span
      class={props.display ? "math-formula math-formula-block" : "math-formula"}
      innerHTML={html()}
    />
  );
}

/**
 * Explicit inline $TeX$ in repository-authored lesson prose only.
 * Never pass student input, task-sheet content, code, or arbitrary API messages.
 * Keep dynamic prose outside formulas; interpolate only validated numeric values.
 * Use MathFormula with display for standalone or multiline derivations.
 */
export function MathText(props: { children: string; renderText?: (text: string) => JSX.Element }) {
  const parts = createMemo(() => props.children.split(/\$([^$\n]+)\$/g));
  return (
    <For each={parts()}>
      {(part, i) => (
        <Show fallback={props.renderText ? props.renderText(part) : part} when={i() % 2 === 1}>
          <MathFormula>{part}</MathFormula>
        </Show>
      )}
    </For>
  );
}
