import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";

export function StatsModePicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl<T>
      aria-label={label}
      className="sf-filter-pills"
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      {options.map((option) => (
        <SegmentedControlItem key={option.value} value={option.value}>
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
