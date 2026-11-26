import { PythonCodeWithBlanks, type PythonCodePart } from "../../../shared/ui/PythonCode";
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
  const codeParts: PythonCodePart[] = parts.map((part) =>
    part.kind === "text"
      ? { kind: "code", code: part.text }
      : {
          kind: "blank",
          id: part.id,
          value: fills[part.id] ?? "",
          ariaLabel: blankLabel?.(part.id) ?? `空 ${part.id}`,
          maxLength: 300,
          minWidth: Math.max(5, (fills[part.id] ?? "").length + 2),
          onChange: (value) => onFill(part.id, value),
        },
  );

  return <PythonCodeWithBlanks ariaLabel={ariaLabel} className="cloze-code" parts={codeParts} />;
}
