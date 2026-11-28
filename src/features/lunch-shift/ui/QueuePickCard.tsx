import { For } from "solid-js";
import type { QueuePick } from "../domain/contracts.ts";

const STAGE_LABEL = { kitchen: "厨房", delivery: "出餐" } as const;

export function QueuePickCard(props: { pick: QueuePick }) {
  return (
    <div class="lunch-pick-card">
      <p class="lunch-pick-head">
        第 {props.pick.tick} 拍 · {STAGE_LABEL[props.pick.stage]} 选单
      </p>
      <table>
        <thead>
          <tr>
            <th>订单</th>
            <th>urgent</th>
            <th>wait</th>
            <th>cook</th>
            <th>priority() 输出</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <For each={props.pick.candidates}>
            {(candidate) => (
              <tr class={candidate.id === props.pick.picked ? "picked" : ""}>
                <td>
                  <b>{candidate.id}</b>
                </td>
                <td>{candidate.urgent ? "True" : "False"}</td>
                <td>{candidate.waitTicks}</td>
                <td>{candidate.cookTicks}</td>
                <td>{candidate.value ?? "没用到函数"}</td>
                <td>{candidate.id === props.pick.picked ? "← 先做" : ""}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
