import { useMemo, type CSSProperties, type ReactNode } from "react";
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
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = from;

  highlightTree(
    tree,
    classHighlighter,
    (tokenFrom, tokenTo, classes) => {
      const start = Math.max(from, tokenFrom);
      const end = Math.min(to, tokenTo);
      if (end <= start) return;
      if (start > cursor) nodes.push(source.slice(cursor, start));
      nodes.push(
        <span className={classes} key={`${keyPrefix}-${start}-${end}`}>
          {source.slice(start, end)}
        </span>,
      );
      cursor = end;
    },
    from,
    to,
  );

  if (cursor < to) nodes.push(source.slice(cursor, to));
  return nodes;
}

export function PythonCode({
  ariaLabel,
  className,
  code,
}: {
  ariaLabel?: string;
  className?: string;
  code: string;
}) {
  const tree = useMemo(() => pythonLanguage.parser.parse(code), [code]);
  return (
    <pre aria-label={ariaLabel} className={`python-code${className ? ` ${className}` : ""}`}>
      <code>{highlightedRange(code, tree, 0, code.length, "python-code")}</code>
    </pre>
  );
}

/**
 * Highlighted, editable Python. Parsing the assembled source preserves syntax
 * context around every blank, including blank expressions inside conditions
 * and arithmetic.
 */
export function PythonCodeWithBlanks({
  ariaLabel,
  className,
  parts,
}: {
  ariaLabel: string;
  className?: string;
  parts: PythonCodePart[];
}) {
  const source = useMemo(
    () => parts.map((part) => (part.kind === "code" ? part.code : part.value)).join(""),
    [parts],
  );
  const tree = useMemo(() => pythonLanguage.parser.parse(source), [source]);
  let cursor = 0;

  return (
    <pre aria-label={ariaLabel} className={`python-code${className ? ` ${className}` : ""}`}>
      <code>
        {parts.map((part, index) => {
          const start = cursor;
          const end = start + (part.kind === "code" ? part.code.length : part.value.length);
          cursor = end;

          if (part.kind === "code") {
            return (
              <span key={`code-${index}`}>
                {highlightedRange(source, tree, start, end, `code-${index}`)}
              </span>
            );
          }

          const width = Math.max(part.minWidth ?? 5, part.value.length + 2);
          return (
            <span
              className="python-code-blank"
              key={`blank-${part.id}`}
              style={{ "--python-blank-width": `${width}ch` } as CSSProperties}
            >
              <span aria-hidden="true" className="python-code-blank-mirror">
                {highlightedRange(source, tree, start, end, `blank-${part.id}`)}
              </span>
              <input
                aria-label={part.ariaLabel}
                autoCapitalize="none"
                autoComplete="off"
                maxLength={part.maxLength}
                onChange={(event) => part.onChange(event.target.value)}
                spellCheck={false}
                title={part.title ?? part.ariaLabel}
                type="text"
                value={part.value}
              />
            </span>
          );
        })}
      </code>
    </pre>
  );
}
