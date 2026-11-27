import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/solid/segmented-control";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

export type SegmentedPickerOption<T extends string> = {
  value: T;
  label: JSX.Element;
  class?: string;
  disabled?: boolean;
  data?: Record<string, string | number | undefined>;
};

export type SegmentedPickerProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentedPickerOption<T>[];
  onChange: (value: T) => void;
  class?: string;
  itemClass?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
};

/**
 * Shared single-choice button row built on the ui-sdk segmented control:
 * one tab stop, arrow-key movement, and radio semantics for free.
 */
export function SegmentedPicker<T extends string>(props: SegmentedPickerProps<T>) {
  return (
    <SegmentedControl<T>
      aria-label={props.label}
      class={`segmented-picker${props.class ? ` ${props.class}` : ""}`}
      disabled={props.disabled}
      onValueChange={(next) => {
        if (next !== null) props.onChange(next);
      }}
      orientation={props.orientation}
      value={props.value}
    >
      <SegmentedControlIndicator />
      <For each={props.options}>
        {(option) => (
          <SegmentedControlItem
            class={`segmented-picker-item${props.itemClass ? ` ${props.itemClass}` : ""}${option.class ? ` ${option.class}` : ""}`}
            {...option.data}
            disabled={option.disabled}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        )}
      </For>
    </SegmentedControl>
  );
}
