/**
 * The "拍" (tick) explainer: one step of system time, shown as a small
 * timeline diagram. Rendered where students first meet the unit
 * (stage-1 cook choice) and referenced again near tick-based tables.
 */

const TICKS = [1, 2, 3, 4, 5] as const;
const X0 = 60;
const STEP = 104;

export function TickExplainer() {
  return (
    <figure className="lunch-tick-explainer">
      <svg
        viewBox="0 0 640 168"
        role="img"
        aria-label="拍的解释：每过一拍，炉灶做一步活、等着的单多等一拍"
      >
        {/* 时间轴 */}
        <line x1={X0 - 20} y1="26" x2="620" y2="26" className="tick-axis" />
        <polygon points="620,26 612,22 612,30" className="tick-axis" />
        {TICKS.map((t) => (
          <g key={t}>
            <line
              x1={X0 + (t - 1) * STEP}
              y1="20"
              x2={X0 + (t - 1) * STEP}
              y2="32"
              className="tick-mark"
            />
            <text x={X0 + (t - 1) * STEP} y="14" textAnchor="middle" className="tick-num">
              第 {t} 拍
            </text>
          </g>
        ))}

        {/* 行一：炉灶做一步活 —— 一张 3 拍单一格一格做完 */}
        <text x="10" y="62" className="tick-row-label">
          灶上
        </text>
        {TICKS.map((t) => (
          <rect
            key={t}
            x={X0 + (t - 1) * STEP - 14}
            y="46"
            width="28"
            height="20"
            rx="4"
            className={t <= 3 ? "tick-cell done" : "tick-cell"}
          />
        ))}
        <text x="628" y="61" textAnchor="end" className="tick-hint">
          做完一份要 3 拍
        </text>

        {/* 行二：等待 +1 */}
        <text x="10" y="98" className="tick-row-label">
          等位
        </text>
        {TICKS.map((t) => (
          <g key={t}>
            <rect
              x={X0 + (t - 1) * STEP - 16}
              y="82"
              width="32"
              height="22"
              rx="4"
              className="tick-card"
            />
            <text x={X0 + (t - 1) * STEP} y="97" textAnchor="middle" className="tick-card-text">
              等 {t - 1}
            </text>
          </g>
        ))}
        <text x="628" y="98" textAnchor="end" className="tick-hint">
          每过一拍等位 +1
        </text>

        {/* 行三：送餐走一步 */}
        <text x="10" y="134" className="tick-row-label">
          送餐
        </text>
        {TICKS.map((t) => (
          <g key={t}>
            {t < 4 ? (
              <>
                <circle cx={X0 + (t - 1) * STEP} cy="130" r="9" className="tick-dish-dot" />
                <text
                  x={X0 + (t - 1) * STEP}
                  y="134"
                  textAnchor="middle"
                  className="tick-dish-text"
                >
                  餐
                </text>
              </>
            ) : t === 4 ? (
              <text x={X0 + (t - 1) * STEP + 30} y="135" className="tick-hint arrived">
                送到 5 号桌
              </text>
            ) : null}
          </g>
        ))}
        <text x="628" y="134" textAnchor="end" className="tick-hint">
          每拍走一格
        </text>
      </svg>
      <figcaption>
        一拍就是系统走的一步：每过一拍，炉灶做一步活，等着的每张单多等一拍，送出的餐往前挪一格。
      </figcaption>
    </figure>
  );
}
