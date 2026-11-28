import { Button } from "@ui-sdk/solid/button";
import { Show } from "solid-js";
import type { ComponentSelection } from "../domain/componentize";
import { CustomComponentDialog, type ComponentizeForm } from "./CustomComponentDialog";

export function CircuitCanvasTools(props: {
  selectedCount: number;
  selection: ComponentSelection;
  dialogOpen: boolean;
  existingNames: readonly string[];
  onOpenDialog: () => void;
  onClearSelection: () => void;
  onCloseDialog: () => void;
  onCreate: (form: ComponentizeForm) => void;
}) {
  return (
    <>
      <Show when={props.selectedCount > 0}>
        <div class="circuit-canvas-tools">
          <span>
            已框选 {props.selection.selectedIds.length} 个元件
            {props.selection.error ? ` · ${props.selection.error}` : "，可封装为可重复使用的组件"}
          </span>
          <div>
            <Button
              class="button button-secondary"
              disabled={Boolean(props.selection.error)}
              onClick={props.onOpenDialog}
              type="button"
            >
              封装为自定义组件
            </Button>
            <Button class="button button-ghost" onClick={props.onClearSelection} type="button">
              清除选区
            </Button>
            <span class="circuit-canvas-tool-note">选中画布中的自定义组件后可拆分回去</span>
          </div>
        </div>
      </Show>
      <Show when={props.dialogOpen}>
        <CustomComponentDialog
          existingNames={[...props.existingNames]}
          onCancel={props.onCloseDialog}
          onCreate={props.onCreate}
          selection={props.selection}
        />
      </Show>
    </>
  );
}
