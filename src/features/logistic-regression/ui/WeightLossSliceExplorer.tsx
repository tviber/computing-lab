import { createMemo, createSignal, Show } from "solid-js";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import { MathFormula, MathText } from "../../../shared/ui/MathFormula";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import { getPublicCorpus } from "../domain/corpus.ts";
import type { TrainedModel } from "../domain/logisticRegression.ts";
import {
  buildWordSliceDataset,
  clampSliceEta,
  clampSliceW,
  evaluateSliceAt,
  sampleLossSliceCurve,
  SLICE_MAX_ETA,
  SLICE_MIN_ETA,
  SLICE_WORD_OPTIONS,
  stepSliceWeight,
  type SliceStepDirection,
} from "../domain/lossSlice.ts";
import { WeightLossSliceChart } from "./WeightLossSliceChart.tsx";
import { fmtSigned, type ContextMode, type TrailPoint } from "./weightLossSliceGeometry.ts";
import { WeightLossSliceMetricsPanel } from "./WeightLossSliceMetricsPanel.tsx";

const ETA_QUICK_PRESETS = [
  { label: "稳步 $\\eta=0.8$", eta: 0.8 },
  { label: "适中 $\\eta=2.0$", eta: 2.0 },
  { label: "跨谷反弹 $\\eta=5.5$", eta: 5.5 },
  { label: "大幅震荡 $\\eta=7.5$", eta: 7.5 },
] as const;

const DEFAULT_START_W = 2.0;

type SliceSession = {
  token: object;
  trail: TrailPoint[] | null;
  hint: string | null;
};

export function WeightLossSliceExplorer(props: { trainedModel: TrainedModel }) {
  const train = getPublicCorpus().train;
  const [selectedWord, setSelectedWord] = createSignal<string>(SLICE_WORD_OPTIONS[0].word);
  const [contextMode, setContextMode] = createSignal<ContextMode>("zero");
  const [sliceEta, setSliceEta] = createSignal<number>(2.0);
  const [currentW, setCurrentW] = createSignal<number>(DEFAULT_START_W);
  const [session, setSession] = createSignal<SliceSession | null>(null);

  const activeContextModel = createMemo(() =>
    contextMode() === "trained" ? props.trainedModel : null,
  );

  // Fresh identity whenever (word, contextMode, activeContextModel) changes,
  // automatically expiring trail and hint without manual field comparisons.
  const contextToken = createMemo(() => ({
    word: selectedWord(),
    mode: contextMode(),
    model: activeContextModel(),
  }));

  const dataset = createMemo(() =>
    buildWordSliceDataset(selectedWord(), train, activeContextModel()),
  );
  const curve = createMemo(() => sampleLossSliceCurve(dataset().samples));
  const currentEval = createMemo(() => evaluateSliceAt(dataset().samples, currentW()));
  const previewDescent = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "descent"),
  );
  const previewLeft = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "left"),
  );
  const previewRight = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "right"),
  );

  const activeSession = createMemo(() => {
    const entry = session();
    return entry && entry.token === contextToken() ? entry : null;
  });

  const activeTrail = createMemo<TrailPoint[]>(() => {
    const trail = activeSession()?.trail;
    if (trail && trail.length > 0) return trail;
    return [{ ...currentEval(), deltaW: null, action: "init" }];
  });

  const statusHint = createMemo(() => activeSession()?.hint ?? null);

  const updateSession = (patch: { trail?: TrailPoint[] | null; hint?: string | null }) => {
    const token = contextToken();
    const prev = activeSession();
    setSession({
      token,
      trail: patch.trail !== undefined ? patch.trail : (prev?.trail ?? null),
      hint: patch.hint !== undefined ? patch.hint : (prev?.hint ?? null),
    });
  };

  const wordMeta = createMemo(
    () => SLICE_WORD_OPTIONS.find((item) => item.word === selectedWord()) ?? SLICE_WORD_OPTIONS[0],
  );
  const learnedW = createMemo(() => props.trainedModel.weightsByWord.get(selectedWord()));
  const actualSpamRate = createMemo(() =>
    dataset().totalCount > 0 ? dataset().posCount / dataset().totalCount : 0,
  );

  const setPointAt = (nextW: number, hint: string | null = null) => {
    const safeW = clampSliceW(nextW);
    const ev = evaluateSliceAt(dataset().samples, safeW);
    setCurrentW(safeW);
    updateSession({ trail: [{ ...ev, deltaW: null, action: "init" }], hint });
  };

  const handleSelectWord = (word: string) => {
    setSelectedWord(word);
    setPointAt(DEFAULT_START_W);
  };

  const handleSelectContext = (mode: ContextMode) => {
    setContextMode(mode);
    setPointAt(DEFAULT_START_W);
  };

  const triggerStep = (direction: SliceStepDirection) => {
    const outcome = stepSliceWeight(dataset().samples, currentW(), sliceEta(), direction);
    if (outcome.isAtMinimum) {
      updateSession({
        hint: "当前位置已经到谷底，坡度几乎为 0，单靠自动步长推不动了。请直接拖动曲线上的圆点放到斜坡上再试。",
      });
      return;
    }
    if (Math.abs(outcome.actualDelta) < 1e-5 && outcome.clamped) {
      updateSession({ hint: "已到达横轴展示边界，无法继续向该方向移动。" });
      return;
    }
    const base = activeTrail();
    const nextPoint: TrailPoint = {
      ...outcome.to,
      deltaW: outcome.actualDelta,
      action: direction,
    };
    setCurrentW(outcome.to.w);
    updateSession({
      trail: [...base.slice(-6), nextPoint],
      hint: outcome.clamped ? "步子太大，落点已贴到坐标轴边界。" : null,
    });
  };

  const triggerFiveSteps = () => {
    let wCursor = currentW();
    const base = activeTrail();
    const nextPoints: TrailPoint[] = [...base];
    for (let i = 0; i < 5; i++) {
      const outcome = stepSliceWeight(dataset().samples, wCursor, sliceEta(), "descent");
      if (outcome.isAtMinimum || Math.abs(outcome.actualDelta) < 1e-5) break;
      wCursor = outcome.to.w;
      nextPoints.push({
        ...outcome.to,
        deltaW: outcome.actualDelta,
        action: "descent",
      });
    }
    setCurrentW(wCursor);
    updateSession({
      trail: nextPoints.slice(-7),
      hint:
        nextPoints.length === base.length
          ? "已在谷底附近，坡度接近 0，不需要继续移动。"
          : "已连续顺坡走了几步，观察每步跨度怎样随坡度变化。",
    });
  };

  const loadBouncePreset = () => {
    setSelectedWord("好");
    setContextMode("zero");
    setSliceEta(6.5);
    setPointAt(
      2.0,
      "已选中「好」，学习率为 6.5。连续点击两次「按梯度更新一步」，比较起点和第二步结束的位置。",
    );
  };

  return (
    <section
      aria-label="单维权重与损失切片探索"
      class="logistic-regression-panel logistic-regression-slice-panel"
    >
      <div class="logistic-regression-panel-head">
        <h3>固定其他权重，只调整一个词</h3>
        <span class="logistic-regression-badge-neutral">
          含「{selectedWord()}」样本：{dataset().totalCount} 条（垃圾 {dataset().posCount} · 正常{" "}
          {dataset().negCount}）
        </span>
      </div>

      <p class="logistic-regression-data-guide">
        真实模型有几千个词，画不出来全貌。我们先把其他词权重固定住，只单独调「{selectedWord()}
        」的权重：不含该词的短信（<MathFormula>x_j=0</MathFormula>
        ）不会受这个词影响，所以这里只统计包含该词的 {dataset().totalCount}{" "}
        条短信的平均损失。沿负梯度更新时，步长合适才会下降；步长太大也可能越过谷底。
      </p>

      <div class="logistic-regression-slice-toolbar">
        <div class="logistic-regression-slice-group">
          <span class="logistic-regression-field-label">1. 选一个词：</span>
          <SegmentedPicker
            class="logistic-regression-preset-row"
            itemClass="logistic-regression-chip-btn"
            label="选择切片词"
            onChange={handleSelectWord}
            options={SLICE_WORD_OPTIONS.map((opt) => ({
              value: opt.word,
              label: <span>「{opt.label}」</span>,
            }))}
            value={selectedWord()}
          />
        </div>

        <div class="logistic-regression-slice-group">
          <span class="logistic-regression-field-label">2. 其他词固定为：</span>
          <SegmentedPicker
            class="logistic-regression-segmented"
            label="选择其余权重基准"
            onChange={handleSelectContext}
            options={[
              { value: "zero", label: "全为 0（训练起点）" },
              { value: "trained", label: "当前训练模型权重" },
            ]}
            value={contextMode()}
          />
        </div>
      </div>

      <p class="logistic-regression-muted-note">
        <MathText>{wordMeta().note}</MathText>
        <Show when={contextMode() === "trained" && learnedW() !== undefined}>
          当前模型为「{selectedWord()}」学到的权重是{" "}
          <MathFormula>{`w=${fmtSigned(learnedW()!)}`}</MathFormula>，
          {Math.abs(learnedW()! - curve().minPoint.w) <= 0.35
            ? "已经靠近区间最低点。"
            : "与区间最低点仍有差距（可能学习率/轮数尚未收敛或波动较大）。"}
        </Show>
        <Show when={contextMode() === "zero"}>其余参数全为 0 时，</Show>
        当前绘图区间内的最低点位于{" "}
        <MathFormula>{String.raw`w^*\approx ${fmtSigned(curve().minPoint.w, 2)}`}</MathFormula>。
      </p>

      <div class="logistic-regression-slice-eta-bar">
        <LabeledSlider
          class="logistic-regression-inline-slider"
          label={
            <>
              单步步长系数 <MathFormula>{String.raw`\eta`}</MathFormula>
            </>
          }
          max={SLICE_MAX_ETA}
          min={SLICE_MIN_ETA}
          onChange={(next) => setSliceEta(clampSliceEta(next))}
          step={0.1}
          value={sliceEta()}
          valueText={sliceEta().toFixed(1)}
        />
        <SegmentedPicker
          class="logistic-regression-preset-row"
          itemClass="logistic-regression-chip-btn logistic-regression-chip-sm"
          label="快速步长预设"
          onChange={(value) => {
            const preset = ETA_QUICK_PRESETS.find((candidate) => String(candidate.eta) === value);
            if (preset) setSliceEta(preset.eta);
          }}
          options={ETA_QUICK_PRESETS.map((preset) => ({
            value: String(preset.eta),
            label: <MathText>{preset.label}</MathText>,
          }))}
          value={
            ETA_QUICK_PRESETS.find(
              (preset) => Math.abs(sliceEta() - preset.eta) < 0.05,
            )?.eta.toString() ?? ""
          }
        />
      </div>

      <WeightLossSliceChart
        contextMode={contextMode()}
        currentEval={currentEval()}
        curve={curve()}
        learnedW={learnedW()}
        onSetW={(nextW) => setPointAt(nextW)}
        previewDescent={previewDescent()}
        selectedWord={selectedWord()}
        trail={activeTrail()}
      />

      <WeightLossSliceMetricsPanel
        actualSpamRate={actualSpamRate()}
        contextMode={contextMode()}
        currentEval={currentEval()}
        curve={curve()}
        onBouncePreset={loadBouncePreset}
        onFiveSteps={triggerFiveSteps}
        onReset={() => setPointAt(DEFAULT_START_W)}
        onStep={triggerStep}
        previewDescent={previewDescent()}
        previewLeft={previewLeft()}
        previewRight={previewRight()}
        selectedWord={selectedWord()}
        statusHint={statusHint()}
        trail={activeTrail()}
      />
    </section>
  );
}
