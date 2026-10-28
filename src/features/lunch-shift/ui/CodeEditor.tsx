/**
 * Shared CodeMirror wrapper for the lunch-shift Python editors — same
 * configuration as the color-quantization lab's editor.
 */

import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

const EDITOR_EXTENSIONS = [python(), indentUnit.of("    "), keymap.of([indentWithTab])];

export function CodeEditor({
  ariaLabel,
  value,
  onChange,
  height = "220px",
  disabled = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  height?: string;
  disabled?: boolean;
}) {
  return (
    <CodeMirror
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
      }}
      className="lunch-editor"
      editable={!disabled}
      extensions={EDITOR_EXTENSIONS}
      height={height}
      onChange={onChange}
      theme="dark"
      value={value}
    />
  );
}
