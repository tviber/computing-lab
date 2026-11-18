import { useId, useState } from "react";

/**
 * Keeps the main view focused on what Loss and Gradient actually DO
 * ("mistake penalty score" and "parameter-nudging compass") with concise final
 * takeaways, while hiding the full Max-Likelihood and chain-rule derivations
 * behind one lightweight optional toggle.
 */
export function LossDerivationCard() {
  const [showMathAppendix, setShowMathAppendix] = useState(false);
  const appendixId = useId();

  return (
    <div className="ml-role-wrap">
      <div className="ml-derivation-grid">
        <div className="ml-formula-card">
          <div className="ml-formula-head">
            <span className="ml-badge-neutral">损失（Loss）= 猜错扣分表</span>
          </div>
          <p className="ml-role-desc">
            用来给模型打分：猜得越准扣分越接近 0；越自信地猜错（如真垃圾却只猜
            2%），扣分就会急剧飙升。训练的目标就是把扣分压到最低。
          </p>
          <p className="ml-formula-conclusion ml-mono">扣分 = −ln(猜中真实标签的概率)</p>
        </div>

        <div className="ml-formula-card">
          <div className="ml-formula-head">
            <span className="ml-badge-neutral">斜率 / 梯度 = 调参指南针</span>
          </div>
          <p className="ml-role-desc">
            用来决定往哪边改权重、一次改多少：坡越陡、猜错越离谱，推力就越大；到谷底坡度为 0
            时停止改动。
          </p>
          <p className="ml-formula-conclusion ml-mono">
            每次改变量 Δw<sub>j</sub> = −η · (p − y) · x<sub>j</sub>
          </p>
        </div>
      </div>

      <div className="ml-appendix-bar">
        <button
          aria-controls={appendixId}
          aria-expanded={showMathAppendix}
          className="button button-ghost ml-toggle-btn"
          onClick={() => setShowMathAppendix((v) => !v)}
          type="button"
        >
          {showMathAppendix
            ? "收起数学推导附录"
            : "选读：查看背后的数学推导（极大似然 → 最小化 Loss & 链式求导）"}
        </button>
      </div>

      {showMathAppendix ? (
        <div className="ml-appendix-grid" id={appendixId}>
          <div className="ml-derivation-body">
            <p className="ml-subhead">1. 为什么扣分公式长成交叉熵？（极大似然 → 最小化 Loss）</p>
            <ol className="ml-derivation-steps">
              <li>
                合并两种标签的猜对概率：
                <code className="ml-mono ml-math-line">
                  P(y | x) = p<sup>y</sup> · (1 − p)<sup>1−y</sup>
                </code>
              </li>
              <li>
                极大似然（希望所有样本同时猜对的联合概率最大）：
                <code className="ml-mono ml-math-line">
                  max ∏<sub>i=1..N</sub> p<sub>i</sub>
                  <sup>
                    y<sub>i</sub>
                  </sup>{" "}
                  · (1 − p<sub>i</sub>)
                  <sup>
                    1−y<sub>i</sub>
                  </sup>
                </code>
              </li>
              <li>
                取对数让连乘变求和，再取负号与均值变成“最小化损失”：
                <code className="ml-mono ml-math-line">
                  min L = −(1/N) ∑<sub>i=1..N</sub> [ y<sub>i</sub> ln(p<sub>i</sub>) + (1 − y
                  <sub>i</sub>) ln(1 − p<sub>i</sub>) ]
                </code>
              </li>
            </ol>
          </div>

          <div className="ml-derivation-body">
            <p className="ml-subhead">2. 为什么每次改动量刚好是 −η·(p − y)·xⱼ？（链式求导）</p>
            <ol className="ml-derivation-steps">
              <li>
                拆三层求导（z = w·x + b，p = σ(z)）：
                <code className="ml-mono ml-math-line">
                  ∂L / ∂w<sub>j</sub> = (∂L / ∂p) · (∂p / ∂z) · (∂z / ∂w<sub>j</sub>)
                </code>
              </li>
              <li>
                交叉熵导数与 Sigmoid 导数：
                <code className="ml-mono ml-math-line">
                  ∂L / ∂p = (p − y) / [p(1 − p)] ， ∂p / ∂z = p(1 − p)
                </code>
              </li>
              <li>
                上下约去 p(1 − p)，再乘 ∂z/∂w<sub>j</sub> = x<sub>j</sub>（0/1 词袋中出现为
                1，未出现为 0）：
                <code className="ml-mono ml-math-line">
                  ∂L / ∂w<sub>j</sub> = (p − y) · x<sub>j</sub> ⇒ w<sub>j</sub> ← w<sub>j</sub> − η
                  · (p − y) · x<sub>j</sub>
                </code>
              </li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
