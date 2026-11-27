import { createMemo } from "solid-js";
import { PythonCodeWithBlanks, type PythonCodePart } from "../../../shared/ui/PythonCode";
import { parseCloze } from "../domain/cloze.ts";

export function ClozeEditor(props: {
  code: string;
  fills: Record<string, string>;
  onFill: (blankId: string, value: string) => void;
  ariaLabel?: string;
  blankLabel?: (blankId: string) => string;
}) {
  const codeParts = createMemo<PythonCodePart[]>(() =>
    parseCloze(props.code).map((part) =>
      part.kind === "text"
        ? { kind: "code", code: part.text }
        : {
            kind: "blank",
            id: part.id,
            value: props.fills[part.id] ?? "",
            ariaLabel: props.blankLabel?.(part.id) ?? `空 ${part.id}`,
            maxLength: 300,
            minWidth: Math.max(5, (props.fills[part.id] ?? "").length + 2),
            onChange: (value) => props.onFill(part.id, value),
          },
    ),
  );

  return (
    <PythonCodeWithBlanks
      ariaLabel={props.ariaLabel ?? "decode 填空代码"}
      className="cloze-code"
      parts={codeParts()}
    />
  );
}
