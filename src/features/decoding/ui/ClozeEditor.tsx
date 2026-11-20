import { Fragment } from "react";
import { parseCloze } from "../domain/cloze.ts";

export function ClozeEditor({
  code,
  fills,
  onFill,
  ariaLabel = "decode 填空代码",
  blankLabel,
}: {
  code: string;
  fills: Record<string, string>;
  onFill: (blankId: string, value: string) => void;
  ariaLabel?: string;
  blankLabel?: (blankId: string) => string;
}) {
  const parts = parseCloze(code);
  return (
    <pre aria-label={ariaLabel} className="cloze-code">
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : (
          <input
            aria-label={blankLabel?.(part.id) ?? `空 ${part.id}`}
            className="cloze-blank"
            key={i}
            maxLength={300}
            onChange={(e) => onFill(part.id, e.target.value)}
            spellCheck={false}
            style={{ width: `${Math.max(5, (fills[part.id] ?? "").length + 2)}ch` }}
            title={blankLabel?.(part.id) ?? `空 ${part.id}`}
            type="text"
            value={fills[part.id] ?? ""}
          />
        ),
      )}
    </pre>
  );
}
