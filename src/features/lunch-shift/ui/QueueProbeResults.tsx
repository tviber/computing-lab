import { For } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { QUEUE_PROBES } from "../domain/queueProbes.ts";
import { probePassCount, type ProbeRow } from "./queueModel";

/** The 12 grading probes: each is one queue snapshot asking "who first?". */
export function QueueProbeResults(props: { probes: ProbeRow[] }) {
  return (
    <section class="lunch-result" role="status">
      <p class="eyebrow">
        抽检结果 · 答对 {probePassCount(props.probes)} / {props.probes.length}
      </p>
      <p class="lunch-note">
        每张卡列出正在等餐的订单，顺序是先来后到。运行后会显示你的函数选了哪张、按等待上限该选哪张；一样急时保持先来后到。
      </p>
      <div class="lunch-table-wrap">
        <table class="lunch-orders-table">
          <thead>
            <tr>
              <th>情况</th>
              <th>在等的单（先来后到）</th>
              <th>你的函数选</th>
              <th>该先做</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.probes}>
              {(row) => {
                const probe = QUEUE_PROBES.find((item) => item.id === row.id);
                const label = (index: number) => {
                  const candidate = probe?.candidates[index];
                  return candidate
                    ? `${index + 1} 号（${candidate.urgent ? "加急" : "普通"}·等${candidate.wait}拍·${candidate.cook}拍菜）`
                    : `${index + 1} 号`;
                };
                return (
                  <tr>
                    <td>{row.title}</td>
                    <td>
                      {probe?.candidates
                        .map(
                          (candidate, index) =>
                            `${index + 1} 号${candidate.urgent ? "加急" : "普通"}(等${candidate.wait})`,
                        )
                        .join("、")}
                    </td>
                    <td>{label(row.picked)}</td>
                    <td>{label(row.answer)}</td>
                    <td>
                      <Icon name={row.passed ? "check" : "x"} size={12} />
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
