import { createMemo, For, Show } from "solid-js";
import type { RunSummary } from "../domain/contracts.ts";
import { lateOrdersOf, starvedByUrgent, waitLimit } from "./queueModel";

export function QueueLateOrders(props: { run: RunSummary }) {
  const late = createMemo(() => lateOrdersOf(props.run));

  return (
    <Show
      fallback={<p class="lunch-feedback success">12 张订单全部准时送达。</p>}
      when={late().length > 0}
    >
      <ul class="lunch-late-list">
        <For each={late()}>
          {(order) => (
            <li>
              <b>{order.id}</b>（{(order.expected?.urgent ?? order.urgent) ? "加急" : "普通"}）
              {order.delivered
                ? `送到时已经等了 ${order.wait} 拍，等待上限是 ${waitLimit(order)} 拍`
                : `到第 30 拍还没送出去，等待上限是 ${waitLimit(order)} 拍`}
              {!order.expected?.urgent && starvedByUrgent(props.run, order.id)
                ? "，一直排在加急单后面"
                : ""}
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
