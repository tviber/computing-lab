import { useId, useState } from "react";

export function LossDerivationCard() {
  const [showMathAppendix, setShowMathAppendix] = useState(false);
  const appendixId = useId();

  return (
    <div className="logistic-regression-role-wrap">
      <div className="logistic-regression-derivation-grid">
        <div className="logistic-regression-formula-card">
          <div className="logistic-regression-formula-head">
            <span className="logistic-regression-badge-neutral">交叉熵损失</span>
          </div>
          <p className="logistic-regression-role-desc">
            模型给真实标签的概率越高，损失越接近 0。如果把一条垃圾短信的概率估成 2%，损失就很大。
          </p>
          <p className="logistic-regression-formula-conclusion logistic-regression-mono">
            损失 = −ln(模型给真实标签的概率)
          </p>
        </div>

        <div className="logistic-regression-formula-card">
          <div className="logistic-regression-formula-head">
            <span className="logistic-regression-badge-neutral">梯度与权重更新</span>
          </div>
          <p className="logistic-regression-role-desc">
            按梯度的反方向更新权重。梯度的大小乘以学习率，就是这一步的改变量大小。
          </p>
          <p className="logistic-regression-formula-conclusion logistic-regression-mono">
            每次改变量 Δw<sub>j</sub> = −η · (p − y) · x<sub>j</sub>
          </p>
        </div>
      </div>

      <div className="logistic-regression-appendix-bar">
        <button
          aria-controls={appendixId}
          aria-expanded={showMathAppendix}
          className="button button-ghost logistic-regression-toggle-btn disclosure-trigger"
          onClick={() => setShowMathAppendix((v) => !v)}
          type="button"
        >
          {showMathAppendix ? "收起数学推导" : "数学推导（选读，不考查）"}
        </button>
      </div>

      {showMathAppendix ? (
        <div className="logistic-regression-appendix-grid" id={appendixId}>
          <div className="logistic-regression-derivation-body">
            <p className="logistic-regression-subhead">从极大似然到最小化交叉熵</p>
            <ol className="logistic-regression-derivation-steps">
              <li>
                标签 yᵢ 只有 1 和 0。观察到垃圾短信时，这条标签的概率是 pᵢ。观察到正常短信时，概率是
                1 − pᵢ。用一个式子写出两种情况：
                <code className="logistic-regression-mono logistic-regression-math-line">
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
                给定各条短信，假设它们的标签条件独立。把观察到的标签概率相乘，就得到训练集的似然。极大似然选择让这个乘积最大的参数：
                <code className="logistic-regression-mono logistic-regression-math-line">
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
                对数单调递增，最大化似然也就等价于最大化对数似然。取负号把最大化变成最小化，再除以样本数
                N，得到<strong>平均二元交叉熵（BCE）</strong>：
                <code className="logistic-regression-mono logistic-regression-math-line">
                  L = (1/N) ∑<sub>i=1..N</sub> ℓ<sub>i</sub> = −(1/N) ∑<sub>i=1..N</sub> [ y
                  <sub>i</sub> ln(p<sub>i</sub>) + (1 − y<sub>i</sub>) ln(1 − p<sub>i</sub>) ]
                </code>
              </li>
            </ol>
          </div>

          <div className="logistic-regression-derivation-body">
            <p className="logistic-regression-subhead">链式法则如何化简权重梯度</p>
            <ol className="logistic-regression-derivation-steps">
              <li>
                先对<strong>单样本损失 ℓᵢ</strong> 拆三层求导（z<sub>i</sub> = w·x<sub>i</sub> +
                b，p
                <sub>i</sub> = σ(z<sub>i</sub>)）：
                <code className="logistic-regression-mono logistic-regression-math-line">
                  ∂ℓ<sub>i</sub> / ∂w<sub>j</sub> = (∂ℓ<sub>i</sub> / ∂p<sub>i</sub>) · (∂p
                  <sub>i</sub> / ∂z<sub>i</sub>) · (∂z<sub>i</sub> / ∂w<sub>j</sub>)
                </code>
              </li>
              <li>
                单样本交叉熵导数与 Sigmoid 导数：
                <code className="logistic-regression-mono logistic-regression-math-line">
                  ∂ℓ<sub>i</sub> / ∂p<sub>i</sub> = (p<sub>i</sub> − y<sub>i</sub>) / [p
                  <sub>i</sub>(1 − p<sub>i</sub>)] ， ∂p<sub>i</sub> / ∂z<sub>i</sub> = p
                  <sub>i</sub>(1 − p<sub>i</sub>)
                </code>
              </li>
              <li>
                交叉熵导数的分母与 Sigmoid 导数恰好都是 pᵢ(1 − pᵢ)，相乘时约掉这一项。再乘 ∂z
                <sub>i</sub>/∂w<sub>j</sub> = x<sub>ij</sub>，就得到单条短信的更新公式：
                <code className="logistic-regression-mono logistic-regression-math-line">
                  ∂ℓ<sub>i</sub> / ∂w<sub>j</sub> = (p<sub>i</sub> − y<sub>i</sub>) · x<sub>ij</sub>{" "}
                  ⇒ w<sub>j</sub> ← w<sub>j</sub> − η · (p<sub>i</sub> − y<sub>i</sub>) · x
                  <sub>ij</sub>
                </code>
              </li>
              <li>
                例如，垃圾短信的 y = 1。若 p = 0.20、η = 0.1，短信中出现的词 xⱼ = 1，权重就增加
                0.08。未出现的词 xⱼ = 0，权重不变。
              </li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
