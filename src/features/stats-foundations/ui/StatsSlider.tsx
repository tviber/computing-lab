import { Field, FieldLabel } from "@ui-sdk/solid/field";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider";

export function StatsSlider(props: {
  label: string;
  suffix?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <Slider
        class="sf-slider-group"
        max={props.max}
        min={props.min}
        onValueChange={(next) => props.onChange(next)}
        step={props.step}
        value={props.value}
      >
        <div class="sf-slider-head">
          <FieldLabel>{props.label}</FieldLabel>
          <SliderValue class="sf-mono">
            {props.value}
            {props.suffix ?? ""}
          </SliderValue>
        </div>
        <SliderControl class="sf-fit-slider-control">
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  );
}
