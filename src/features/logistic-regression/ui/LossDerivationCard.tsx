import { MathFormula } from "../../../shared/ui/MathFormula";
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
          <p className="logistic-regression-formula-conclusion">
            <MathFormula>{String.raw`\text{损失} = -\ln\!\left(\text{模型给真实标签的概率}\right)`}</MathFormula>
          </p>
        </div>

        <div className="logistic-regression-formula-card">
          <div className="logistic-regression-formula-head">
            <span className="logistic-regression-badge-neutral">梯度与权重更新</span>
          </div>
          <p className="logistic-regression-role-desc">
            按梯度的反方向更新权重。梯度的大小乘以学习率，就是这一步的改变量大小。
          </p>
          <p className="logistic-regression-formula-conclusion">
            每次改变量 <MathFormula>{String.raw`\Delta w_j=-\eta\,(p-y)\,x_j`}</MathFormula>
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
          {showMathAppendix ? "收起数学推导" : "数学推导"}
        </button>
      </div>

      {showMathAppendix ? (
        <div className="logistic-regression-appendix-grid" id={appendixId}>
          <div className="logistic-regression-derivation-body">
            <p className="logistic-regression-subhead">从极大似然到最小化交叉熵</p>
            <ol className="logistic-regression-derivation-steps">
              <li>
                标签 <MathFormula>y_i</MathFormula> 只有 1 和 0。观察到垃圾短信时，这条标签的概率是{" "}
                <MathFormula>p_i</MathFormula>。观察到正常短信时，概率是
                <MathFormula>1-p_i</MathFormula>。用一个式子写出两种情况：
                <MathFormula display>{String.raw`\begin{aligned}
P(y_i\mid x_i)&=p_i^{y_i}(1-p_i)^{1-y_i}\\
\ell_i&=-\ln P(y_i\mid x_i)\\
&=-[y_i\ln p_i+(1-y_i)\ln(1-p_i)]
\end{aligned}`}</MathFormula>
              </li>
              <li>
                给定各条短信，假设它们的标签条件独立。把观察到的标签概率相乘，就得到训练集的似然。极大似然选择让这个乘积最大的参数：
                <MathFormula display>{String.raw`\begin{aligned}
&\max_{w,b}\prod_{i=1}^N P(y_i\mid x_i)\\
&=\max_{w,b}\prod_{i=1}^N p_i^{y_i}(1-p_i)^{1-y_i}
\end{aligned}`}</MathFormula>
              </li>
              <li>
                对数单调递增，最大化似然也就等价于最大化对数似然。取负号把最大化变成最小化，再除以样本数
                N，得到<strong>平均二元交叉熵（BCE）</strong>：
                <MathFormula display>{String.raw`\begin{aligned}
L&=\frac{1}{N}\sum_{i=1}^N\ell_i\\
&=-\frac{1}{N}\sum_{i=1}^N\big[y_i\ln p_i+(1-y_i)\ln(1-p_i)\big]
\end{aligned}`}</MathFormula>
              </li>
            </ol>
          </div>

          <div className="logistic-regression-derivation-body">
            <p className="logistic-regression-subhead">链式法则如何化简权重梯度</p>
            <ol className="logistic-regression-derivation-steps">
              <li>
                先对
                <strong>
                  单样本损失 <MathFormula>{String.raw`\ell_i`}</MathFormula>
                </strong>{" "}
                拆三层求导（<MathFormula>{String.raw`z_i=w\cdot x_i+b`}</MathFormula>，
                <MathFormula>{String.raw`p_i=\sigma(z_i)`}</MathFormula>）：
                <MathFormula
                  display
                >{String.raw`\frac{\partial\ell_i}{\partial w_j}=\frac{\partial\ell_i}{\partial p_i}\cdot\frac{\partial p_i}{\partial z_i}\cdot\frac{\partial z_i}{\partial w_j}`}</MathFormula>
              </li>
              <li>
                单样本交叉熵导数与 Sigmoid 导数：
                <MathFormula display>{String.raw`\begin{aligned}
\frac{\partial\ell_i}{\partial p_i}&=\frac{p_i-y_i}{p_i(1-p_i)}\\
\frac{\partial p_i}{\partial z_i}&=p_i(1-p_i)
\end{aligned}`}</MathFormula>
              </li>
              <li>
                交叉熵导数的分母与 Sigmoid 导数恰好都是 <MathFormula>p_i(1-p_i)</MathFormula>
                ，相乘时约掉这一项。再乘{" "}
                <MathFormula>{String.raw`\frac{\partial z_i}{\partial w_j}=x_{ij}`}</MathFormula>
                ，就得到单条短信的更新公式：
                <MathFormula display>{String.raw`\begin{aligned}
\frac{\partial\ell_i}{\partial w_j}&=(p_i-y_i)\,x_{ij}\\
w_j&\leftarrow w_j-\eta\,(p_i-y_i)\,x_{ij}
\end{aligned}`}</MathFormula>
              </li>
              <li>
                例如，垃圾短信的 <MathFormula>y=1</MathFormula>。若{" "}
                <MathFormula>p=0.20</MathFormula>、<MathFormula>{String.raw`\eta=0.1`}</MathFormula>
                ，短信中出现的词 <MathFormula>x_j=1</MathFormula>，权重就增加 0.08。未出现的词{" "}
                <MathFormula>x_j=0</MathFormula>，权重不变。
              </li>
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
