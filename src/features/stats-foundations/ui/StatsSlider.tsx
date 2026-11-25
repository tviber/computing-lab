import { Field, FieldLabel } from "@ui-sdk/react/field";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider";

export function StatsSlider({
  label,
  suffix = "",
  value,
  min,
  max,
  step,
  onChange,
}: {
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
        className="sf-slider-group"
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onChange}
      >
        <div className="sf-slider-head">
          <FieldLabel>{label}</FieldLabel>
          <SliderValue className="sf-mono">
            {value}
            {suffix}
          </SliderValue>
        </div>
        <SliderControl className="sf-fit-slider-control">
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  );
}
