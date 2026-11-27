import { Field, FieldLabel } from "@ui-sdk/solid/field";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider";
import type { JSX } from "@solidjs/web";

export type LabeledSliderProps = {
  label: JSX.Element;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Formatted value shown on the right; defaults to the raw value. */
  valueText?: string;
  suffix?: string;
  /** Extra class on the field wrapper. */
  class?: string;
  valueClass?: string;
  disabled?: boolean;
  /** Optional content below the rail, such as a regime note. */
  children?: JSX.Element;
};

/** Shared labelled range control: ui-sdk slider behavior with the lab styling. */
export function LabeledSlider(props: LabeledSliderProps) {
  return (
    <Field class={`labeled-slider${props.class ? ` ${props.class}` : ""}`}>
      <Slider
        class="labeled-slider-control"
        disabled={props.disabled}
        format={(value) => props.valueText ?? `${value}${props.suffix ?? ""}`}
        max={props.max}
        min={props.min}
        onValueChange={(next) => {
          if (typeof next === "number") props.onChange(next);
        }}
        step={props.step}
        value={props.value}
      >
        <div class="labeled-slider-head">
          <FieldLabel>{props.label}</FieldLabel>
          <SliderValue
            class={`labeled-slider-value${props.valueClass ? ` ${props.valueClass}` : ""}`}
          />
        </div>
        <SliderControl class="labeled-slider-control-area">
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
      {props.children}
    </Field>
  );
}
