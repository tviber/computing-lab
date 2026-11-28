import { For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import type { RunSummary } from "../domain/contracts.ts";
import { QueueLateOrders } from "./QueueLateOrders";
import { QueuePickCard } from "./QueuePickCard";
import { QueueReplay } from "./QueueReplay";

export function QueueResultView(props: { run: RunSummary; title: string; autoPlay?: boolean }) {
  const picks = () => props.run.picks ?? [];
  return (
    <section class="lunch-result" role="status">
      <p class="eyebrow">{props.title}</p>
      <div aria-label="本轮关键指标" class="lunch-stat-row">
        <span>
          <b>
            {props.run.onTime} / {props.run.orders.length}
          </b>
          准时送达{props.run.onTime === props.run.orders.length ? " ★" : ""}
        </span>
        <span>
          <b>
            {props.run.delivered} / {props.run.orders.length}
          </b>
          实际送达
        </span>
      </div>
      <QueueReplay autoPlay={props.autoPlay} run={props.run} />
      <QueueLateOrders run={props.run} />
      <Show when={picks().length > 0}>
        <Disclosure class="lunch-pick-table" summary="每一拍怎么选的">
          <div>
            <For each={picks()}>{(pick) => <QueuePickCard pick={pick} />}</For>
          </div>
        </Disclosure>
      </Show>
    </section>
  );
}
