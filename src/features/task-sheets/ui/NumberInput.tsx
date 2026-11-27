import { SHEET_LIMITS } from "../domain/schema";

export function NumberInput(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label class="ts-num">
      <span>{props.label}</span>
      <input
        max={props.max ?? SHEET_LIMITS.maxScore}
        min={props.min ?? 1}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        type="number"
        value={props.value}
      />
    </label>
  );
}
