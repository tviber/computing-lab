import { MathFormula } from "../../../shared/ui/MathFormula";
/**
 * Live numeric readout for the current stage's buses. Sits above the
 * circuit canvas so toggling an input pin immediately shows the whole
 * number it forms — the core "these bits ARE a number" evidence.
 * Text first; color is only a secondary cue (undriven pins get
 * is-floating and a literal "?").
 */

import { createMemo, For, Show } from "solid-js";
import { readBuses, type BusReading } from "../domain/bus";
import type { Bit } from "../domain/graph";
import type { StageDef } from "../domain/stages";
import { AnnotatedText } from "./CalculatorTerms";

function BusCard(props: { reading: BusReading }) {
  return (
    <article class="bus-card">
      <header class="bus-card-head">
        <strong>
          <AnnotatedText text={props.reading.bus.name} />
        </strong>
        <span class="bus-direction">高位 → 低位</span>
      </header>
      <div class="bus-bits" role="list">
        <Show when={props.reading.bus.implicitSign}>
          <span
            aria-label={`符号位，值 ${props.reading.signBit ?? "?"}`}
            class={`bus-bit is-implied${props.reading.signBit === null ? " is-floating" : ""}`}
            role="listitem"
          >
            <span aria-hidden="true" class="bus-bit-name">
              <AnnotatedText text="符号位" />
            </span>
            <span aria-hidden="true" class="bus-bit-value">
              {props.reading.signBit ?? "?"}
            </span>
          </span>
        </Show>
        <For each={props.reading.bus.pins}>
          {(pin, i) => {
            const bit = () => props.reading.bits[i()];
            return (
              <span
                aria-label={`${pin}，值 ${bit() ?? "?"}`}
                class={`bus-bit${bit() === null ? " is-floating" : ""}`}
                role="listitem"
              >
                <span aria-hidden="true" class="bus-bit-name">
                  <AnnotatedText text={pin} />
                </span>
                <span aria-hidden="true" class="bus-bit-value">
                  {bit() ?? "?"}
                </span>
              </span>
            );
          }}
        </For>
      </div>
      <p class="bus-reading">
        <span class="bus-reading-label">无符号</span>
        <strong>{props.reading.unsigned ?? "—"}</strong>
      </p>
      <Show when={props.reading.bus.signed}>
        <p class="bus-reading">
          <span class="bus-reading-label">补码</span>
          <strong>{props.reading.signed ?? "—"}</strong>
        </p>
      </Show>
      <Show when={props.reading.placeValue}>
        {(placeValue) => (
          <p class="bus-place-value">
            {/* Generated solely from numeric bus weights/bits, never names. */}
            <MathFormula>{placeValue().replaceAll("×", "\\times ")}</MathFormula>
          </p>
        )}
      </Show>
    </article>
  );
}

function BusGroup(props: { title: string; readings: BusReading[] }) {
  return (
    <Show when={props.readings.length > 0}>
      <div class="bus-group">
        <p class="eyebrow">{props.title}</p>
        <div class="bus-cards">
          <For each={props.readings}>{(reading) => <BusCard reading={reading} />}</For>
        </div>
      </div>
    </Show>
  );
}

export function BusReadout(props: { stage: StageDef; pins: Record<string, Bit | null> }) {
  const readings = createMemo(() => readBuses(props.stage.buses, props.pins));
  const inputReadings = createMemo(() => readings().filter((r) => r.bus.role === "input"));
  const outputReadings = createMemo(() => readings().filter((r) => r.bus.role === "output"));

  return (
    <section aria-label="数值读数" class="bus-readout">
      <BusGroup readings={inputReadings()} title="输入" />
      <BusGroup readings={outputReadings()} title="输出" />
    </section>
  );
}
