import { For, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { Icon } from "../../../shared/ui/Icon";
import type { TicketPrediction } from "../domain/aiIntake.ts";

export type PreviewRow = {
  id: string;
  request: string;
  prediction: TicketPrediction;
  confirmed: boolean;
  correct?: boolean;
};

export function ticketText(prediction: TicketPrediction): string {
  const t = prediction.ticket;
  return `${t.item || "?"} · 「${t.note}」 · ${t.table || "?"}号桌 · ${t.urgent ? "加急" : "普通"}`;
}

/** The field dragging the order's confidence down — the one worth a second look. */
export function weakestField(prediction: TicketPrediction): string {
  const fields: [string, number][] = [
    ["菜品", prediction.item.margin],
    ["备注", prediction.note.margin],
    ["桌号", prediction.table.margin],
    ["时效", prediction.urgent.margin],
  ];
  fields.sort((a, b) => a[1] - b[1]);
  return fields[0][0];
}

export function formatScore(score: number): string {
  return score.toFixed(3);
}

export function OrderPreviewTable(props: {
  rows: PreviewRow[];
  showCorrect: boolean;
  open?: boolean;
}) {
  return (
    <Disclosure class="lunch-reference" open={props.open} summary="看每一张订单的判断">
      <div class="lunch-table-wrap">
        <table class="lunch-orders-table">
          <thead>
            <tr>
              <th>订单</th>
              <th>顾客说</th>
              <th>AI 记的小票</th>
              <th>similarity</th>
              <th>margin</th>
              <Show when={props.showCorrect}>
                <th>AI 记对</th>
              </Show>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <td>
                    <b>{row.id}</b>
                  </td>
                  <td>
                    <small>{row.request}</small>
                  </td>
                  <td>{ticketText(row.prediction)}</td>
                  <td>
                    {formatScore(row.prediction.similarity)}
                    <br />
                    <small>较弱：{weakestField(row.prediction)}</small>
                  </td>
                  <td>{formatScore(row.prediction.margin)}</td>
                  <Show when={props.showCorrect}>
                    <td>
                      <Icon name={row.correct === false ? "x" : "check"} size={13} />
                    </td>
                  </Show>
                  <td>{row.confirmed ? "再确认 +1 拍" : "直接记"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Disclosure>
  );
}
