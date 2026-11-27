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
  return <span class={props.display ? "math-formula-block" : undefined} innerHTML={html()} />;
}

/** Inline $TeX$ in authored lesson prose. */
export function MathText(props: { children: string }) {
  const parts = createMemo(() => props.children.split(/\$([^$\n]+)\$/g));
  return (
    <For each={parts()}>
      {(part, i) => (
        <Show fallback={part} when={i() % 2 === 1}>
          <MathFormula>{part}</MathFormula>
        </Show>
      )}
    </For>
  );
}
