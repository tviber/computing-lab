/**
 * Shared CodeMirror wrapper for the lunch-shift Python editors — same
 * configuration as the color-quantization lab's editor.
 */

import { PythonEditor } from "../../../shared/ui/PythonEditor";

export function CodeEditor(props: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  height?: string;
  disabled?: boolean;
}) {
  return (
    <PythonEditor
      ariaLabel={props.ariaLabel}
      className="lunch-editor"
      editable={!(props.disabled ?? false)}
      height={props.height ?? "220px"}
      onChange={(value) => props.onChange(value)}
      value={props.value}
    />
  );
}
