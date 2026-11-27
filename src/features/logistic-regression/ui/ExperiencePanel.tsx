import { Button } from "@ui-sdk/solid/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { StageTask } from "../../../shared/lab/StageTask";
import { createExperienceClassifier, EXPERIENCE_EXAMPLES } from "../domain/experience.ts";
import type { ExperienceSubmission, TrainingSettings } from "../domain/protocol.ts";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

export function ExperiencePanel(props: {
  training: TrainingSettings;
  hasSubmittedModel: boolean;
  onComplete: (submission: ExperienceSubmission) => void;
  onReviewTraining: () => void;
  passed: boolean;
  submitting: boolean;
}) {
  const inputId = createUniqueId();
  const [probeText, setProbeText] = createSignal("");
  const [sampleResult, setSampleResult] = createSignal<ExperienceSubmission | null>(null);

  const classifier = createMemo(() =>
    createExperienceClassifier({ eta: props.training.eta, epochs: props.training.epochs }),
  );
  const text = createMemo(() => probeText().trim());
  const inspection = createMemo(() => (text() ? classifier().inspect(text()) : null));

  return (
    <section
      aria-label="短信分类体验"
      class="logistic-regression-panel logistic-regression-experience"
    >
      <StageTask title="试一条短信">
        选一条例子，或写一条自己的短信。改几个字，再看分类是否变化。
      </StageTask>
      <div class="logistic-regression-panel-head">
        <Button class="button button-ghost" onClick={() => props.onReviewTraining()} type="button">
          返回训练模型
        </Button>
      </div>
      <p class="logistic-regression-data-guide">
        {props.hasSubmittedModel ? "第 4 关已通过的模型" : "第 4 关当前模型"} · 学习率{" "}
        {props.training.eta} · {props.training.epochs} 轮 · 系统阈值{" "}
        {(classifier().threshold * 100).toFixed(0)}%
      </p>
      <div aria-label="短信示例" class="logistic-regression-preset-row" role="group">
        <For each={EXPERIENCE_EXAMPLES}>
          {(example) => (
            <Button
              aria-pressed={probeText() === example.text ? "true" : "false"}
              class={`logistic-regression-chip-btn${probeText() === example.text ? " is-active" : ""}`}
              onClick={() => {
                setProbeText(example.text);
                setSampleResult({
                  activity: "sms-classification",
                  exampleId: example.id,
                  prediction: classifier().inspect(example.text).pred,
                });
              }}
              type="button"
            >
              {example.label}
            </Button>
          )}
        </For>
      </div>
      <label class="logistic-regression-field-label" for={inputId}>
        短信内容
      </label>
      <textarea
        class="logistic-regression-text-input logistic-regression-experience-input"
        id={inputId}
        maxlength={240}
        onChange={(event) => setProbeText(event.currentTarget.value)}
        onInput={(event) => setProbeText(event.currentTarget.value)}
        placeholder="自写短信只在这个页面处理"
        rows={3}
        value={probeText()}
      />
      <div aria-live="polite" class="logistic-regression-experience-result">
        <Show
          fallback={
            <span class="logistic-regression-muted-note">输入短信后，这里会显示分类结果。</span>
          }
          when={inspection()}
        >
          {(insp) => (
            <>
              <strong
                class={`logistic-regression-pill ${insp().pred === 1 ? "is-danger" : "is-success"}`}
              >
                模型分类：{insp().pred === 1 ? "垃圾短信" : "正常短信"}
              </strong>
              <span class="logistic-regression-muted-note">
                垃圾短信概率 {(insp().probability * 100).toFixed(1)}%
              </span>
            </>
          )}
        </Show>
      </div>
      <Show when={inspection()}>
        {(insp) => (
          <Collapsible class="logistic-regression-experience-details">
            <CollapsibleTrigger
              class="disclosure-trigger logistic-regression-experience-details-trigger"
              type="button"
            >
              查看哪些词影响了分类
            </CollapsibleTrigger>
            <CollapsiblePanel class="logistic-regression-experience-details-panel">
              <MessageProbeCard inspection={insp()} threshold={classifier().threshold} />
            </CollapsiblePanel>
          </Collapsible>
        )}
      </Show>
      <Show
        fallback={
          <div class="logistic-regression-submit-bar">
            <Button
              class="button button-primary"
              disabled={!sampleResult() || props.submitting}
              onClick={() => {
                const res = sampleResult();
                if (res) props.onComplete(res);
              }}
              type="button"
            >
              {props.submitting ? "正在记录…" : "完成体验"}
            </Button>
            <Show when={!sampleResult()}>
              <span>点击任一示例，试分一次即可记录进度。</span>
            </Show>
          </div>
        }
        when={props.passed}
      >
        <p class="stage-takeaway" role="status">
          已完成短信分类体验
        </p>
      </Show>
    </section>
  );
}
