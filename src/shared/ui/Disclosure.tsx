import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show, untrack } from "solid-js";
import { DisclosureChevron } from "./DisclosureChevron";

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
  chevronColor?: string;
};

/**
 * One disclosure for the whole site: the ui-sdk collapsible behavior plus the
 * shared chevron direction, so summary rows look and behave the same everywhere.
 */
export function Disclosure(props: DisclosureProps) {
  const [innerOpen, setInnerOpen] = createSignal(
    untrack(() => props.open ?? props.defaultOpen ?? false),
  );

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
          <DisclosureChevron
            color={props.chevronColor}
            open={innerOpen()}
            size={props.chevronSize}
          />
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
