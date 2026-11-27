import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/solid/segmented-control";
import { For } from "solid-js";

export function StatsModePicker<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl<T>
      aria-label={props.label}
      class="sf-filter-pills"
      onValueChange={(next) => {
        if (next !== null) props.onChange(next);
      }}
      value={props.value}
    >
      <For each={props.options}>
        {(option) => (
          <SegmentedControlItem value={option.value}>{option.label}</SegmentedControlItem>
        )}
      </For>
    </SegmentedControl>
  );
}
