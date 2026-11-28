import { createSignal } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { Disclosure } from "../../../shared/ui/Disclosure";

export function LossDerivationCard() {
  const [showMathAppendix, setShowMathAppendix] = createSignal(false);

  return (
    <div class="logistic-regression-role-wrap">
      <div class="logistic-regression-derivation-grid">
        <div class="logistic-regression-formula-card">
          <div class="logistic-regression-formula-head">
            <span class="logistic-regression-badge-neutral">交叉熵损失</span>
          </div>
          <p class="logistic-regression-role-desc">
            模型给真实类别的概率越高，损失越接近 0。真实类别是垃圾时看{" "}
            <MathFormula>{String.raw`p`}</MathFormula>，是正常时看{" "}
            <MathFormula>{String.raw`1-p`}</MathFormula>。 例如，一条垃圾短信的预测垃圾概率只有
            2%，损失为 <MathFormula>{String.raw`-\ln(0.02)\approx3.91`}</MathFormula>；预测为 98%
            时，损失约为 0.02。
          </p>
          <p class="logistic-regression-old-knowledge">
            联系线性回归：单样本平方误差的梯度是{" "}
            <MathFormula>{String.raw`2(\hat y-y)x_j`}</MathFormula>；若损失前带{" "}
            <MathFormula>{String.raw`\frac12`}</MathFormula>，系数 2
            就会抵消。逻辑回归配合交叉熵后，梯度也有“预测 −
            真实，再乘输入”的形式，其中预测是垃圾概率 <MathFormula>{String.raw`p`}</MathFormula>。
          </p>
          <p class="logistic-regression-formula-conclusion">
            <MathFormula>{String.raw`\text{损失} = -\ln\!\left(\text{模型给真实标签的概率}\right)`}</MathFormula>
          </p>
        </div>

        <div class="logistic-regression-formula-card">
          <div class="logistic-regression-formula-head">
            <span class="logistic-regression-badge-neutral">梯度与权重更新</span>
          </div>
          <p class="logistic-regression-role-desc">
            梯度指出当前损失增大最快的方向，更新时沿反方向走。对每个权重，改变量等于负的学习率乘以它的梯度。
            SGD 每次使用一条短信的梯度，因此整体平均损失不一定每一步都下降。
          </p>
          <p class="logistic-regression-formula-conclusion">
            每次改变量 <MathFormula>{String.raw`\Delta w_j=-\eta\,(p-y)\,x_j`}</MathFormula>
          </p>
        </div>
      </div>

      <Disclosure
        class="logistic-regression-role-wrap"
        onOpenChange={(open) => setShowMathAppendix(open)}
        open={showMathAppendix()}
        panelClass="logistic-regression-appendix-grid"
        summary={<>{showMathAppendix() ? "收起数学推导" : "数学推导"}</>}
        summaryClass="button button-ghost logistic-regression-toggle-btn"
      >
        <div class="logistic-regression-derivation-body">
          <p class="logistic-regression-subhead">从极大似然到最小化交叉熵</p>
          <ol class="logistic-regression-derivation-steps">
            <li>
              标签 <MathFormula>y_i</MathFormula> 为 1 表示垃圾，为 0 表示正常。模型预测的垃圾概率是{" "}
              <MathFormula>p_i</MathFormula>，正常概率是
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
              为什么取对数？对数能把连乘变成求和。和式可以逐项求导，比对许多项的连乘使用乘积法则更容易计算。
              直接累加各项的对数，也能避免大量小概率连乘后，小到超出计算机的表示范围。
              对数单调递增，所以使似然最大的参数，也使对数似然最大。取负号把最大化变成最小化，再除以固定的样本数
              N，得到<strong>平均二元交叉熵（BCE）</strong>；取平均不会改变最优参数：
              <MathFormula display>{String.raw`\begin{aligned}
\ln\prod_{i=1}^N P(y_i\mid x_i)&=\sum_{i=1}^N\ln P(y_i\mid x_i)\\
L&=\frac{1}{N}\sum_{i=1}^N\ell_i\\
&=-\frac{1}{N}\sum_{i=1}^N\big[y_i\ln p_i+(1-y_i)\ln(1-p_i)\big]
\end{aligned}`}</MathFormula>
            </li>
          </ol>
        </div>

        <div class="logistic-regression-derivation-body">
          <p class="logistic-regression-subhead">链式法则如何化简权重梯度</p>
          <ol class="logistic-regression-derivation-steps">
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
              例如，垃圾短信的 <MathFormula>y=1</MathFormula>。若 <MathFormula>p=0.20</MathFormula>
              、<MathFormula>{String.raw`\eta=0.1`}</MathFormula>
              ，短信中出现的词 <MathFormula>x_j=1</MathFormula>，权重就增加 0.08。未出现的词{" "}
              <MathFormula>x_j=0</MathFormula>，权重不变。偏置的输入恒为 1，因此本次偏置也增加
              0.08。
            </li>
          </ol>
        </div>
      </Disclosure>
    </div>
  );
}
