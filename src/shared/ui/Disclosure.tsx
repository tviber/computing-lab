import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";
import { Icon } from "./Icon";

export type DisclosureProps = {
  summary: JSX.Element;
  children?: JSX.Element;
  class?: string;
  summaryClass?: string;
  panelClass?: string;
  /** Controlled open state. Leave undefined to let the disclosure manage itself. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  keepMounted?: boolean;
  disabled?: boolean;
  chevronSize?: number;
};

/**
 * One disclosure for the whole site: the ui-sdk collapsible behavior plus the
 * shared chevron icon, so summary rows look and behave the same everywhere.
 */
export function Disclosure(props: DisclosureProps) {
  const [innerOpen, setInnerOpen] = createSignal(props.defaultOpen ?? false);

  createEffect(
    () => props.open,
    (open) => {
      if (open !== undefined) setInnerOpen(open);
    },
  );

  return (
    <Collapsible
      class={`disclosure${props.class ? ` ${props.class}` : ""}`}
      disabled={props.disabled}
      onOpenChange={(next) => {
        setInnerOpen(next);
        props.onOpenChange?.(next);
      }}
      open={innerOpen()}
    >
      <CollapsibleTrigger
        class={`disclosure-trigger${props.summaryClass ? ` ${props.summaryClass}` : ""}`}
        type="button"
      >
        <Show when={props.chevronSize !== 0}>
          <span aria-hidden="true" class="disclosure-chevron">
            <Icon name="chevron-down" size={props.chevronSize ?? 14} />
          </span>
        </Show>
        {props.summary}
      </CollapsibleTrigger>
      <CollapsiblePanel
        class={`disclosure-panel${props.panelClass ? ` ${props.panelClass}` : ""}`}
        keepMounted={props.keepMounted ?? true}
      >
        {props.children}
      </CollapsiblePanel>
    </Collapsible>
  );
}
