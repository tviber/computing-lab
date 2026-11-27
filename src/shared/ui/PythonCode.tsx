import type { JSX } from "@solidjs/web";
import { createMemo, For, Show } from "solid-js";
import { pythonLanguage } from "@codemirror/lang-python";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import "./pythonCode.css";

export type PythonCodePart =
  | { kind: "code"; code: string }
  | {
      kind: "blank";
      id: string;
      value: string;
      ariaLabel: string;
      onChange: (value: string) => void;
      minWidth?: number;
      maxLength?: number;
      title?: string;
    };

function highlightedRange(
  source: string,
  tree: ReturnType<typeof pythonLanguage.parser.parse>,
  from: number,
  to: number,
): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  let cursor = from;

  highlightTree(
    tree,
    classHighlighter,
    (tokenFrom, tokenTo, classes) => {
      const start = Math.max(from, tokenFrom);
      const end = Math.min(to, tokenTo);
      if (end <= start) return;
      if (start > cursor) nodes.push(source.slice(cursor, start));
      nodes.push(<span class={classes}>{source.slice(start, end)}</span>);
      cursor = end;
    },
    from,
    to,
  );

  if (cursor < to) nodes.push(source.slice(cursor, to));
  return nodes;
}

export function PythonCode(props: { ariaLabel?: string; class?: string; code: string }) {
  const highlighted = createMemo(() => {
    const tree = pythonLanguage.parser.parse(props.code);
    return highlightedRange(props.code, tree, 0, props.code.length);
  });
  return (
    <pre aria-label={props.ariaLabel} class={`python-code${props.class ? ` ${props.class}` : ""}`}>
      <code>{highlighted()}</code>
    </pre>
  );
}

/**
 * Highlighted, editable Python. Parsing the assembled source preserves syntax
 * context around every blank, including blank expressions inside conditions
 * and arithmetic.
 */
export function PythonCodeWithBlanks(props: {
  ariaLabel: string;
  class?: string;
  parts: PythonCodePart[];
}) {
  const parsed = createMemo(() => {
    const source = props.parts
      .map((part) => (part.kind === "code" ? part.code : part.value))
      .join("");
    const tree = pythonLanguage.parser.parse(source);
    let cursor = 0;
    const ranges = props.parts.map((part, index) => {
      const start = cursor;
      const end = start + (part.kind === "code" ? part.code.length : part.value.length);
      cursor = end;
      return {
        key: part.kind === "blank" ? `blank-${part.id}` : `code-${index}`,
        part,
        start,
        end,
      };
    });
    return { source, tree, ranges };
  });

  return (
    <pre aria-label={props.ariaLabel} class={`python-code${props.class ? ` ${props.class}` : ""}`}>
      <code>
        <For each={parsed().ranges} keyed={(entry) => entry.key}>
          {(entry) => {
            const blankPart = () => {
              const part = entry().part;
              return part.kind === "blank" ? part : null;
            };
            return (
              <Show
                fallback={
                  <span>
                    {highlightedRange(parsed().source, parsed().tree, entry().start, entry().end)}
                  </span>
                }
                when={blankPart()}
              >
                {(blank) => {
                  const width = () => Math.max(blank().minWidth ?? 5, blank().value.length + 2);
                  return (
                    <span
                      class="python-code-blank"
                      style={{ "--python-blank-width": `${width()}ch` } as JSX.CSSProperties}
                    >
                      <span aria-hidden="true" class="python-code-blank-mirror">
                        {highlightedRange(
                          parsed().source,
                          parsed().tree,
                          entry().start,
                          entry().end,
                        )}
                      </span>
                      <input
                        aria-label={blank().ariaLabel}
                        autocapitalize="none"
                        autocomplete="off"
                        maxlength={blank().maxLength}
                        onChange={(event) => blank().onChange(event.currentTarget.value)}
                        onInput={(event) => blank().onChange(event.currentTarget.value)}
                        spellcheck={false}
                        title={blank().title ?? blank().ariaLabel}
                        type="text"
                        value={blank().value}
                      />
                    </span>
                  );
                }}
              </Show>
            );
          }}
        </For>
      </code>
    </pre>
  );
}
