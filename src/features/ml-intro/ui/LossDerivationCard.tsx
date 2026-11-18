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
                合并两种标签的猜对概率，先写出<strong>第 i 条短信</strong>的似然与单样本扣分：
                <code className="ml-mono ml-math-line">
                  P(y<sub>i</sub> | x<sub>i</sub>) = p<sub>i</sub>
                  <sup>
                    y<sub>i</sub>
                  </sup>{" "}
                  · (1 − p<sub>i</sub>)
                  <sup>
                    1−y<sub>i</sub>
                  </sup>{" "}
                  ， ℓ<sub>i</sub> = −ln P(y<sub>i</sub> | x<sub>i</sub>) = −[ y<sub>i</sub> ln(p
                  <sub>i</sub>) + (1 − y<sub>i</sub>) ln(1 − p<sub>i</sub>) ]
                </code>
              </li>
              <li>
                极大似然（希望所有 N 条短信同时猜对的联合概率最大）：
                <code className="ml-mono ml-math-line">
                  max ∏<sub>i=1..N</sub> P(y<sub>i</sub> | x<sub>i</sub>) = max ∏<sub>i=1..N</sub> p
                  <sub>i</sub>
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
                取对数让连乘变求和，再取负号与均值，得到<strong>整个训练集的平均损失 L</strong>：
                <code className="ml-mono ml-math-line">
                  min L = (1/N) ∑<sub>i=1..N</sub> ℓ<sub>i</sub> = −(1/N) ∑<sub>i=1..N</sub> [ y
                  <sub>i</sub> ln(p<sub>i</sub>) + (1 − y<sub>i</sub>) ln(1 − p<sub>i</sub>) ]
                </code>
              </li>
            </ol>
          </div>

          <div className="ml-derivation-body">
            <p className="ml-subhead">
              2. 为什么每次改动量刚好是 −η·(p − y)·xⱼ？（先看单样本，再看整批平均）
            </p>
            <ol className="ml-derivation-steps">
              <li>
                先对<strong>单样本损失 ℓᵢ</strong> 拆三层求导（z<sub>i</sub> = w·x<sub>i</sub> +
                b，p
                <sub>i</sub> = σ(z<sub>i</sub>)）：
                <code className="ml-mono ml-math-line">
                  ∂ℓ<sub>i</sub> / ∂w<sub>j</sub> = (∂ℓ<sub>i</sub> / ∂p<sub>i</sub>) · (∂p
                  <sub>i</sub> / ∂z<sub>i</sub>) · (∂z<sub>i</sub> / ∂w<sub>j</sub>)
                </code>
              </li>
              <li>
                单样本交叉熵导数与 Sigmoid 导数：
                <code className="ml-mono ml-math-line">
                  ∂ℓ<sub>i</sub> / ∂p<sub>i</sub> = (p<sub>i</sub> − y<sub>i</sub>) / [p
                  <sub>i</sub>(1 − p<sub>i</sub>)] ， ∂p<sub>i</sub> / ∂z<sub>i</sub> = p
                  <sub>i</sub>(1 − p<sub>i</sub>)
                </code>
              </li>
              <li>
                上下约去 p<sub>i</sub>(1 − p<sub>i</sub>)，再乘 ∂z<sub>i</sub>/∂w<sub>j</sub> = x
                <sub>ij</sub>，得到 <strong>SGD（每次读 1 条就更新）</strong> 的单步公式：
                <code className="ml-mono ml-math-line">
                  ∂ℓ<sub>i</sub> / ∂w<sub>j</sub> = (p<sub>i</sub> − y<sub>i</sub>) · x<sub>ij</sub>{" "}
                  ⇒ w<sub>j</sub> ← w<sub>j</sub> − η · (p<sub>i</sub> − y<sub>i</sub>) · x
                  <sub>ij</sub>
                </code>
              </li>
              <li>
                对全部 N 条训练短信求平均，就是 <strong>整批平均损失 L 的梯度（BGD）</strong>：
                <code className="ml-mono ml-math-line">
                  ∂L / ∂w<sub>j</sub> = (1/N) ∑<sub>i=1..N</sub> (∂ℓ<sub>i</sub> / ∂w<sub>j</sub>) =
                  (1/N) ∑<sub>i=1..N</sub> (p<sub>i</sub> − y<sub>i</sub>) · x<sub>ij</sub>
                </code>
              </li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
