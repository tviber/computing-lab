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
      {/* Key by value, not by the inline option object, so a parent that rebuilds
          its options array does not recreate (and blur) every item. */}
      <For each={props.options.map((option) => option.value)}>
        {(value) => {
          const option = () =>
            props.options.find((candidate) => candidate.value === value) ??
            props.options[0] ?? { value: value, label: null };
          return (
            <SegmentedControlItem
              class={`segmented-picker-item${props.itemClass ? ` ${props.itemClass}` : ""}${option().class ? ` ${option().class}` : ""}`}
              {...option().data}
              disabled={option().disabled}
              value={value}
            >
              {option().label}
            </SegmentedControlItem>
          );
        }}
      </For>
    </SegmentedControl>
  );
}
