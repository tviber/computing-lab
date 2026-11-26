import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import "./pythonCode.css";

const PYTHON_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--code-keyword)" },
  { tag: [tags.bool, tags.atom, tags.literal], color: "var(--code-literal)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
  { tag: [tags.number, tags.escape], color: "var(--code-number)" },
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className], color: "var(--code-type)" },
  { tag: tags.definition(tags.variableName), color: "var(--code-definition)", fontWeight: "600" },
  { tag: tags.propertyName, color: "var(--code-definition)" },
  { tag: tags.variableName, color: "var(--code-variable)" },
  { tag: tags.operator, color: "var(--code-operator)" },
  { tag: tags.invalid, color: "var(--danger-ink)", textDecoration: "underline wavy" },
]);

const EDITOR_EXTENSIONS = [
  python(),
  indentUnit.of("    "),
  keymap.of([indentWithTab]),
  syntaxHighlighting(PYTHON_HIGHLIGHT_STYLE),
];

export function PythonEditor({
  ariaLabel,
  ariaDescribedBy,
  className,
  editable = true,
  height = "220px",
  onChange,
  value,
}: {
  ariaLabel: string;
  ariaDescribedBy?: string;
  className?: string;
  editable?: boolean;
  height?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CodeMirror
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
      }}
      className={`python-editor${className ? ` ${className}` : ""}`}
      editable={editable}
      extensions={EDITOR_EXTENSIONS}
      height={height}
      onChange={onChange}
      theme="light"
      value={value}
    />
  );
}
