/**
 * The "拍" (tick) explainer: one step of system time, shown as a small
 * timeline diagram. Rendered where students first meet the unit
 * (stage-1 cook choice) and referenced again near tick-based tables.
 */

import { For, Match, Switch } from "solid-js";

const TICKS = [1, 2, 3, 4, 5] as const;
const X0 = 60;
const STEP = 104;

export function TickExplainer() {
  return (
    <figure class="lunch-tick-explainer">
      <svg
        aria-label="拍的解释：每过一拍，炉灶做一步活、等着的单多等一拍"
        role="img"
        viewBox="0 0 640 168"
      >
        {/* 时间轴 */}
        <line class="tick-axis" x1={X0 - 20} x2="620" y1="26" y2="26" />
        <polygon class="tick-axis" points="620,26 612,22 612,30" />
        <For each={TICKS}>
          {(t) => (
            <g>
              <line
                class="tick-mark"
                x1={X0 + (t - 1) * STEP}
                x2={X0 + (t - 1) * STEP}
                y1="20"
                y2="32"
              />
              <text class="tick-num" text-anchor="middle" x={X0 + (t - 1) * STEP} y="14">
                第 {t} 拍
              </text>
            </g>
          )}
        </For>

        {/* 行一：炉灶做一步活 —— 一张 3 拍单一格一格做完 */}
        <text class="tick-row-label" x="10" y="62">
          灶上
        </text>
        <For each={TICKS}>
          {(t) => (
            <rect
              class={t <= 3 ? "tick-cell done" : "tick-cell"}
              height="20"
              rx="4"
              width="28"
              x={X0 + (t - 1) * STEP - 14}
              y="46"
            />
          )}
        </For>
        <text class="tick-hint" text-anchor="end" x="628" y="61">
          做完一份要 3 拍
        </text>

        {/* 行二：等待 +1 */}
        <text class="tick-row-label" x="10" y="98">
          等位
        </text>
        <For each={TICKS}>
          {(t) => (
            <g>
              <rect
                class="tick-card"
                height="22"
                rx="4"
                width="32"
                x={X0 + (t - 1) * STEP - 16}
                y="82"
              />
              <text class="tick-card-text" text-anchor="middle" x={X0 + (t - 1) * STEP} y="97">
                等 {t - 1}
              </text>
            </g>
          )}
        </For>
        <text class="tick-hint" text-anchor="end" x="628" y="98">
          每过一拍等位 +1
        </text>

        {/* 行三：送餐走一步 */}
        <text class="tick-row-label" x="10" y="134">
          送餐
        </text>
        <For each={TICKS}>
          {(t) => (
            <g>
              <Switch>
                <Match when={t < 4}>
                  <circle class="tick-dish-dot" cx={X0 + (t - 1) * STEP} cy="130" r="9" />
                  <text class="tick-dish-text" text-anchor="middle" x={X0 + (t - 1) * STEP} y="134">
                    餐
                  </text>
                </Match>
                <Match when={t === 4}>
                  <text class="tick-hint arrived" x={X0 + (t - 1) * STEP + 30} y="135">
                    送到 5 号桌
                  </text>
                </Match>
              </Switch>
            </g>
          )}
        </For>
        <text class="tick-hint" text-anchor="end" x="628" y="134">
          每拍走一格
        </text>
      </svg>
      <figcaption>
        一拍就是系统走的一步：每过一拍，炉灶做一步活，等着的每张单多等一拍，送出的餐往前挪一格。
      </figcaption>
    </figure>
  );
}
