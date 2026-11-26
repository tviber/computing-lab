/**
 * Shared CodeMirror wrapper for the lunch-shift Python editors — same
 * configuration as the color-quantization lab's editor.
 */

import { PythonEditor } from "../../../shared/ui/PythonEditor";

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
    <PythonEditor
      ariaLabel={ariaLabel}
      className="lunch-editor"
      editable={!disabled}
      height={height}
      onChange={onChange}
      value={value}
    />
  );
}
