import type { JSX } from "@solidjs/web";
import { Button } from "@ui-sdk/solid/button";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@ui-sdk/solid/alert-dialog";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible";
import { createSignal, onSettled, Show, untrack } from "solid-js";
import { DisclosureChevron } from "../ui/DisclosureChevron";
import { Icon } from "../ui/Icon";
import { useScrollEdges } from "../ui/scrollEdges";

export type LabResetScope = { scope: "stage"; stageIndex: number } | { scope: "lab" };

export type LabResetControlsProps = {
  stageIndex: number;
  canReset: boolean;
  resetting: boolean;
  resetError: string | null;
  onReset: (scope: LabResetScope) => Promise<boolean>;
};

export type LabPageShellProps = {
  labId: string;
  rail: JSX.Element;
  collapsedLabel?: JSX.Element;
  railWidth?: number;
  contentClassName?: string;
  resetControls?: LabResetControlsProps;
  children?: JSX.Element;
};

function storageKey(labId: string) {
  return `computing-lab:lab-rail:${labId}`;
}

function readCollapsed(labId: string): boolean {
  try {
    return localStorage.getItem(storageKey(labId)) === "1";
  } catch {
    return false;
  }
}

const narrowRailQuery = "(max-width: 960px)";

function isNarrowRail() {
  return window.matchMedia?.(narrowRailQuery).matches ?? false;
}

function LabProgressTools(props: LabResetControlsProps) {
  const [open, setOpen] = createSignal(false);
  const [scope, setScope] = createSignal<LabResetScope["scope"]>("stage");
  const [showError, setShowError] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  return (
    <div class="lab-progress-tools">
      <Button
        aria-disabled={props.resetting ? "true" : undefined}
        aria-haspopup="dialog"
        aria-label="重置进度"
        class="lab-rail-action"
        disabled={!props.canReset}
        onClick={() => {
          if (props.resetting) return;
          setScope("stage");
          setShowError(false);
          setNotice("");
          setOpen(true);
        }}
        title="重置进度"
        type="button"
      >
        <Icon name="rotate-ccw" size={16} />
        <span>重置进度</span>
      </Button>
      <span class="sr-only" role="status">
        {notice()}
      </span>
      <AlertDialog
        dismissible={!props.resetting}
        onOpenChange={(next) => {
          if (!next && props.resetting) return;
          setOpen(next);
        }}
        open={open()}
      >
        <AlertDialogBackdrop class="lab-reset-backdrop" />
        <AlertDialogContent class="lab-reset-dialog">
          <AlertDialogTitle>重置实验进度</AlertDialogTitle>
          <AlertDialogDescription>
            此操作只影响你自己的记录，清除后无法恢复。
          </AlertDialogDescription>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!props.canReset || props.resetting) return;
              setShowError(true);
              const currentScope = scope();
              if (
                await props.onReset(
                  currentScope === "stage"
                    ? { scope: "stage", stageIndex: props.stageIndex }
                    : { scope: "lab" },
                )
              ) {
                setOpen(false);
                setNotice("实验进度已重置。");
              }
            }}
          >
            <fieldset aria-label="重置范围" class="lab-reset-options" disabled={props.resetting}>
              <label>
                <input
                  checked={scope() === "stage"}
                  name="reset-scope"
                  onChange={() => setScope("stage")}
                  type="radio"
                />
                <span>
                  <strong>从本关重来</strong>
                  <small>清除本关及依赖它的后续关卡记录，保留不受影响的关卡。</small>
                </span>
              </label>
              <label>
                <input
                  checked={scope() === "lab"}
                  name="reset-scope"
                  onChange={() => setScope("lab")}
                  type="radio"
                />
                <span>
                  <strong>重置整个实验</strong>
                  <small>清除所有关卡的记录，从第 1 关开始。</small>
                </span>
              </label>
            </fieldset>
            <Show when={showError() && props.resetError}>
              <p class="test-error" role="alert">
                {props.resetError}
              </p>
            </Show>
            <div class="lab-reset-actions">
              <AlertDialogClose
                class="button button-ghost"
                disabled={props.resetting}
                type="button"
              >
                取消
              </AlertDialogClose>
              <Button
                class="button lab-reset-confirm"
                disabled={!props.canReset || props.resetting}
                type="submit"
              >
                {props.resetting ? "重置中…" : "确认重置"}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function LabPageShell(props: LabPageShellProps) {
  const [narrow, setNarrow] = createSignal(isNarrowRail());
  const [collapsed, setCollapsed] = createSignal(
    untrack(() => narrow() || readCollapsed(props.labId)),
  );
  const scrollRef = useScrollEdges<HTMLDivElement>();

  onSettled(() => {
    const media = window.matchMedia?.(narrowRailQuery);
    if (!media) return;
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  });

  const onOpenChange = (open: boolean) => {
    const next = !open;
    setCollapsed(next);
    if (narrow()) return; // Only desktop interactions change the saved desktop preference.
    try {
      localStorage.setItem(storageKey(props.labId), next ? "1" : "0");
    } catch {
      // storage unavailable — collapse still works for this mount
    }
  };

  return (
    <div
      class={`page-content lab-page-grid${props.contentClassName ? ` ${props.contentClassName}` : ""}${collapsed() ? " is-collapsed" : ""}`}
      style={{ "--rail-w": `${props.railWidth ?? 240}px` } as JSX.CSSProperties}
    >
      <Collapsible class="lab-rail-zone" onOpenChange={onOpenChange} open={!collapsed()}>
        <div class="lab-rail-bar">
          <CollapsibleTrigger
            aria-label={collapsed() ? "展开关卡栏" : "收起关卡栏"}
            class="lab-rail-toggle"
            title={collapsed() ? "展开关卡栏" : "收起关卡栏"}
            type="button"
          >
            <Show
              fallback={
                <Icon name={collapsed() ? "panel-left-open" : "panel-left-close"} size={18} />
              }
              when={narrow()}
            >
              <DisclosureChevron open={!collapsed()} size={18} />
            </Show>
            <Show when={narrow()}>
              <span>{props.collapsedLabel ?? "关卡"}</span>
            </Show>
          </CollapsibleTrigger>
          <Show when={!narrow() && collapsed() && props.collapsedLabel}>
            <span class="lab-rail-bar-label">{props.collapsedLabel}</span>
          </Show>
        </div>
        <CollapsiblePanel class="lab-rail-scroll" keepMounted ref={scrollRef}>
          {props.rail}
        </CollapsiblePanel>
        <Show when={props.resetControls}>
          {(controls) => (
            <LabProgressTools
              canReset={controls().canReset}
              onReset={controls().onReset}
              resetError={controls().resetError}
              resetting={controls().resetting}
              stageIndex={controls().stageIndex}
            />
          )}
        </Show>
      </Collapsible>
      {props.children}
    </div>
  );
}
