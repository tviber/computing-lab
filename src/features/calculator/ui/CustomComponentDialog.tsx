import { Button } from "@ui-sdk/solid/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/solid/dialog";
import { createMemo, createSignal, For, Show, untrack, type Setter } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { Icon } from "../../../shared/ui/Icon";
import { isValidComponentIdentifier, type ComponentSelection } from "../domain/componentize";
import type { ComponentDef } from "../domain/graph";

export type ComponentizeForm = {
  name: string;
  inputNames: string[];
  outputNames: string[];
  inputPortKeys: string[];
  outputPortKeys: string[];
};

type PortDraft = { key: string; name: string };
type PortKind = "input" | "output";

type CustomComponentDialogProps = {
  existingNames?: string[];
  selection?: ComponentSelection;
  component?: ComponentDef;
  onCancel: () => void;
  onCreate?: (form: ComponentizeForm) => void;
  onUpdate?: (form: ComponentizeForm) => void;
};

function firstAvailableName(existingNames: string[]): string {
  const names = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  let index = 1;
  while (names.has(`组合组件${index}`.toLocaleLowerCase())) index += 1;
  return `组合组件${index}`;
}

function nameError(value: string, existingNames: string[], kind: string): string | null {
  const name = value.trim();
  if (!isValidComponentIdentifier(name)) {
    return `${kind}只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。`;
  }
  if (existingNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return `名称“${name}”已存在。`;
  }
  return null;
}

function portNamesError(inputNames: string[], outputNames: string[]): string | null {
  const names = [...inputNames, ...outputNames].map((name) => name.trim());
  if (names.some((name) => !isValidComponentIdentifier(name))) {
    return "端口名称只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。";
  }
  if (new Set(names).size !== names.length) return "入口和出口名称不能重复。";
  return null;
}

function suggestedPortName(label: string, fallback: string): string {
  const candidate = label.split(" 的 ", 1)[0];
  return isValidComponentIdentifier(candidate) ? candidate : fallback;
}

/** Reinsert the dragged port at an index captured by the drop indicator. */
function reorderPorts(ports: PortDraft[], draggedKey: string, insertIndex: number): PortDraft[] {
  const fromIndex = ports.findIndex((port) => port.key === draggedKey);
  if (fromIndex < 0) return ports;
  const next = [...ports];
  const [moved] = next.splice(fromIndex, 1);
  const target = Math.min(
    Math.max(insertIndex - (insertIndex > fromIndex ? 1 : 0), 0),
    next.length,
  );
  next.splice(target, 0, moved);
  return next;
}

function DragGripIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 10 16" width="9">
      <circle cx="2.6" cy="3" r="1.4" />
      <circle cx="7.4" cy="3" r="1.4" />
      <circle cx="2.6" cy="8" r="1.4" />
      <circle cx="7.4" cy="8" r="1.4" />
      <circle cx="2.6" cy="13" r="1.4" />
      <circle cx="7.4" cy="13" r="1.4" />
    </svg>
  );
}

export function CustomComponentDialog(props: CustomComponentDialogProps) {
  const isEditing = () => Boolean(props.component);
  const existingNames = () => props.existingNames ?? [];

  const [name, setName] = createSignal(
    untrack(() => props.component?.name ?? firstAvailableName(props.existingNames ?? [])),
  );
  const [inputPorts, setInputPorts] = createSignal<PortDraft[]>(
    untrack(() =>
      props.component
        ? props.component.graph.nodes
            .filter((port) => port.kind === "input" && port.name)
            .map((port) => ({ key: port.id, name: port.name as string }))
        : (props.selection?.inputPorts ?? []).map((port) => ({
            key: port.key,
            name: suggestedPortName(port.externalLabel, port.defaultName),
          })),
    ),
  );
  const [outputPorts, setOutputPorts] = createSignal<PortDraft[]>(
    untrack(() =>
      props.component
        ? props.component.graph.nodes
            .filter((port) => port.kind === "output" && port.name)
            .map((port) => ({ key: port.id, name: port.name as string }))
        : (props.selection?.outputPorts ?? []).map((port) => ({
            key: port.key,
            name: suggestedPortName(port.externalLabels[0] ?? port.internalLabel, port.defaultName),
          })),
    ),
  );
  const [draggedPort, setDraggedPort] = createSignal<{ kind: PortKind; key: string } | null>(null);
  const [dropIndex, setDropIndex] = createSignal<{ kind: PortKind; index: number } | null>(null);

  const inputNames = createMemo(() => inputPorts().map((port) => port.name));
  const outputNames = createMemo(() => outputPorts().map((port) => port.name));

  const otherNames = createMemo(() =>
    existingNames().filter(
      (existing) =>
        existing.toLocaleLowerCase() !== (props.component?.name ?? "").toLocaleLowerCase(),
    ),
  );
  const componentNameError = createMemo(() => nameError(name(), otherNames(), "组件名称"));
  const portsError = createMemo(() => portNamesError(inputNames(), outputNames()));
  const error = createMemo(() => props.selection?.error ?? componentNameError() ?? portsError());

  const updateName = (setPorts: Setter<PortDraft[]>, key: string, value: string) => {
    setPorts((current) =>
      current.map((port) => (port.key === key ? { ...port, name: value } : port)),
    );
  };

  const clearDrag = () => {
    setDraggedPort(null);
    setDropIndex(null);
  };

  const onPortDragStart = (event: DragEvent, kind: PortKind, key: string) => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", key);
    }
    setDraggedPort({ kind, key });
  };

  /**
   * One dragover listener per list: the insertion index comes from comparing
   * the pointer against each row's midpoint, so hovering gaps still resolves
   * to the nearest slot and the indicator can render between rows.
   */
  const onListDragOver = (event: DragEvent, kind: PortKind, count: number) => {
    if (draggedPort()?.kind !== kind) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rows = target.querySelectorAll("[data-port-key]");
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : 0;
    let index = count;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (pointerY <= rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropIndex({ kind, index });
  };

  const onPortDrop = (event: DragEvent, kind: PortKind, fallbackIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = draggedPort();
    if (dragged?.kind === kind) {
      const currentDrop = dropIndex();
      const index = currentDrop?.kind === kind ? currentDrop.index : fallbackIndex;
      const setter = kind === "input" ? setInputPorts : setOutputPorts;
      setter((current) => reorderPorts(current, dragged.key, index));
    }
    clearDrag();
  };

  const onListDragLeave = (event: DragEvent, kind: PortKind) => {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node | null)) {
      setDropIndex((current) => (current?.kind === kind ? null : current));
    }
  };

  const dropClass = (kind: PortKind, index: number, count: number): string => {
    const currentDrop = dropIndex();
    if (currentDrop?.kind !== kind) return "";
    if (currentDrop.index === index) return " drop-before";
    if (currentDrop.index >= count && index === count - 1) return " drop-after";
    return "";
  };

  return (
    <Dialog
      dismissible
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
      open
    >
      <DialogBackdrop class="custom-component-scrim" />
      <DialogContent class="custom-component-dialog">
        <div class="custom-component-dialog-heading">
          <div>
            <p class="eyebrow">组件封装 / COMPONENT</p>
            <DialogTitle>{isEditing() ? "编辑自定义组件" : "把框选部分变成组件"}</DialogTitle>
          </div>
          <DialogClose aria-label="关闭" class="icon-button" type="button">
            <Icon name="x" size={15} />
          </DialogClose>
        </div>
        <DialogDescription class="custom-component-dialog-note">
          {isEditing()
            ? "拖动端口左侧的手柄可调整输入、输出顺序；修改名称会同步更新组件的连线引用。"
            : "选区内的元件会移入黑盒；跨出选区的连线会自动变成入口或出口。拖动端口左侧的手柄可调整顺序，连线关系会随端口一起移动。"}
        </DialogDescription>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (error()) return;
            const form: ComponentizeForm = {
              name: name().trim(),
              inputNames: inputPorts().map((port) => port.name.trim()),
              outputNames: outputPorts().map((port) => port.name.trim()),
              inputPortKeys: inputPorts().map((port) => port.key),
              outputPortKeys: outputPorts().map((port) => port.key),
            };
            if (isEditing()) props.onUpdate?.(form);
            else props.onCreate?.(form);
          }}
        >
          <label class="custom-component-field">
            <span>组件名称</span>
            <input
              autofocus={!isEditing()}
              onInput={(event) => setName(event.currentTarget.value)}
              value={name()}
            />
          </label>

          <div class="custom-component-port-groups">
            <fieldset
              onDragLeave={(event) => onListDragLeave(event, "input")}
              onDragOver={(event) => onListDragOver(event, "input", inputPorts().length)}
              onDrop={(event) => onPortDrop(event, "input", inputPorts().length)}
            >
              <legend>入口（{inputPorts().length}）</legend>
              <Show
                fallback={<p class="custom-component-no-ports">无入口</p>}
                when={inputPorts().length > 0}
              >
                <For each={inputPorts()} keyed={(port) => port.key}>
                  {(port, index) => (
                    <div
                      class={`custom-component-port-row${
                        draggedPort()?.kind === "input" && draggedPort()?.key === port().key
                          ? " is-drag-source"
                          : ""
                      }${dropClass("input", index(), inputPorts().length)}`}
                      data-port-key={port().key}
                      onDrop={(event) => onPortDrop(event, "input", index())}
                    >
                      <span
                        aria-label={`拖动入口 ${index() + 1}`}
                        class="custom-component-port-drag-handle"
                        draggable="true"
                        onDragEnd={clearDrag}
                        onDragStart={(event) => onPortDragStart(event, "input", port().key)}
                        title="拖动调整顺序"
                      >
                        <DragGripIcon />
                      </span>
                      <input
                        aria-label={`入口 ${index() + 1} 名称`}
                        onInput={(event) =>
                          updateName(setInputPorts, port().key, event.currentTarget.value)
                        }
                        value={port().name}
                      />
                    </div>
                  )}
                </For>
              </Show>
            </fieldset>
            <fieldset
              onDragLeave={(event) => onListDragLeave(event, "output")}
              onDragOver={(event) => onListDragOver(event, "output", outputPorts().length)}
              onDrop={(event) => onPortDrop(event, "output", outputPorts().length)}
            >
              <legend>出口（{outputPorts().length}）</legend>
              <Show
                fallback={<p class="custom-component-no-ports">无出口</p>}
                when={outputPorts().length > 0}
              >
                <For each={outputPorts()} keyed={(port) => port.key}>
                  {(port, index) => (
                    <div
                      class={`custom-component-port-row${
                        draggedPort()?.kind === "output" && draggedPort()?.key === port().key
                          ? " is-drag-source"
                          : ""
                      }${dropClass("output", index(), outputPorts().length)}`}
                      data-port-key={port().key}
                      onDrop={(event) => onPortDrop(event, "output", index())}
                    >
                      <span
                        aria-label={`拖动出口 ${index() + 1}`}
                        class="custom-component-port-drag-handle"
                        draggable="true"
                        onDragEnd={clearDrag}
                        onDragStart={(event) => onPortDragStart(event, "output", port().key)}
                        title="拖动调整顺序"
                      >
                        <DragGripIcon />
                      </span>
                      <input
                        aria-label={`出口 ${index() + 1} 名称`}
                        onInput={(event) =>
                          updateName(setOutputPorts, port().key, event.currentTarget.value)
                        }
                        value={port().name}
                      />
                    </div>
                  )}
                </For>
              </Show>
            </fieldset>
          </div>

          <section aria-label="端口对应关系" class="custom-component-mappings">
            <div>
              <p class="custom-component-mappings-title">
                {isEditing() ? "当前端口顺序" : "端口对应关系"}
              </p>
              <p class="custom-component-mappings-note">
                {isEditing()
                  ? "保存后，组件实例会按新顺序显示；已有连线会继续连接到对应端口。"
                  : "封装后，入口和出口会按顺序连接原电路；名称修改只会改变黑盒外部端口名。"}
              </p>
            </div>
            <Show
              fallback={
                <Show
                  fallback={<p class="custom-component-no-ports">没有跨出选区的端口。</p>}
                  when={inputNames().length > 0 || outputNames().length > 0}
                >
                  <div aria-label="端口摘要" class="custom-component-mapping-summary">
                    <For each={inputPorts()} keyed={(port) => port.key}>
                      {(port, index) => (
                        <div class="custom-component-mapping-summary-row">
                          <strong>{port().name || "（未命名）"}</strong>
                          <span>→ 输入 {index() + 1}</span>
                        </div>
                      )}
                    </For>
                    <For each={outputPorts()} keyed={(port) => port.key}>
                      {(port, index) => (
                        <div class="custom-component-mapping-summary-row">
                          <strong>{port().name || "（未命名）"}</strong>
                          <span>→ 输出 {index() + 1}</span>
                        </div>
                      )}
                    </For>
                  </div>
                  <Disclosure
                    class="custom-component-mapping-details"
                    summary="查看详细端口对应关系"
                  >
                    <div class="custom-component-mapping-details-content">
                      <For each={inputPorts()} keyed={(port) => port.key}>
                        {(port, index) => {
                          const boundary = createMemo(() =>
                            props.selection?.inputPorts.find(
                              (candidate) => candidate.key === port().key,
                            ),
                          );
                          return (
                            <Show when={boundary()}>
                              {(b) => (
                                <div class="custom-component-mapping">
                                  <code>I{index()}</code>
                                  <span class="custom-component-mapping-name">
                                    当前名：{port().name || "（未命名）"}
                                  </span>
                                  <span>
                                    ← {b().externalLabel} → {b().internalLabels.join("、")}
                                  </span>
                                </div>
                              )}
                            </Show>
                          );
                        }}
                      </For>
                      <For each={outputPorts()} keyed={(port) => port.key}>
                        {(port, index) => {
                          const boundary = createMemo(() =>
                            props.selection?.outputPorts.find(
                              (candidate) => candidate.key === port().key,
                            ),
                          );
                          return (
                            <Show when={boundary()}>
                              {(b) => (
                                <div class="custom-component-mapping">
                                  <code>O{index()}</code>
                                  <span class="custom-component-mapping-name">
                                    当前名：{port().name || "（未命名）"}
                                  </span>
                                  <span>
                                    ← {b().internalLabel} → {b().externalLabels.join("、")}
                                  </span>
                                </div>
                              )}
                            </Show>
                          );
                        }}
                      </For>
                    </div>
                  </Disclosure>
                </Show>
              }
              when={isEditing()}
            >
              <p class="custom-component-no-ports">拖动上方手柄即可调整端口顺序。</p>
            </Show>
          </section>

          <Show when={props.selection}>
            {(sel) => (
              <p class="custom-component-selection-summary">
                已框选 {sel().selectedIds.length} 个元件 · 将生成 {inputPorts().length} 个入口、
                {outputPorts().length} 个出口
              </p>
            )}
          </Show>
          <Show when={error()}>
            {(err) => (
              <p class="test-error custom-component-error" role="alert">
                {err()}
              </p>
            )}
          </Show>
          <div class="custom-component-actions">
            <DialogClose class="button button-ghost" type="button">
              取消
            </DialogClose>
            <Button class="button button-primary" disabled={Boolean(error())} type="submit">
              {isEditing() ? "保存修改" : "封装并替换"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
