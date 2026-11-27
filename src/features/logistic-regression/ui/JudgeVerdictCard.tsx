import { MathText } from "../../../shared/ui/MathFormula";
import { Button } from "@ui-sdk/solid/button";
import { For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon.tsx";
import { isMathJudgePart } from "../domain/mathContent.ts";
import type { LogisticRegressionTestSummary } from "../domain/protocol.ts";

export function JudgeVerdictCard(props: {
  summary: LogisticRegressionTestSummary | null;
  passed: boolean;
  hasNextStage: boolean;
  onNextStage?: () => void;
}) {
  return (
    <Show when={props.summary}>
      {(summary) => (
        <section
          aria-live="polite"
          class={`logistic-regression-verdict ${props.passed ? "is-pass" : "is-fail"}`}
          role="status"
        >
          <div class="logistic-regression-verdict-head">
            <strong class="logistic-regression-verdict-title">
              <Icon name={props.passed ? "check" : "warning"} size={15} />
              {props.passed ? "通过本关判定" : "尚未通过本关"}
            </strong>
            <Show when={props.passed && props.hasNextStage && props.onNextStage}>
              {(onNext) => (
                <Button class="button button-primary" onClick={() => onNext()()} type="button">
                  进入下一关 <Icon name="arrow-right" size={14} />
                </Button>
              )}
            </Show>
          </div>
          <p class="logistic-regression-verdict-detail">{summary().detail}</p>
          <ul class="logistic-regression-verdict-parts">
            <For each={summary().parts}>
              {(part) => (
                <li class={part.ok ? "is-ok" : "is-bad"}>
                  <span class="logistic-regression-part-label">
                    <Icon name={part.ok ? "check" : "x"} size={12} />
                    <Show when={isMathJudgePart(part.id)} fallback={part.label}>
                      <MathText>{part.label}</MathText>
                    </Show>
                  </span>
                  <Show when={part.detail}>
                    <span class="logistic-regression-part-detail">
                      <Show when={isMathJudgePart(part.id)} fallback={part.detail}>
                        <MathText>{part.detail!}</MathText>
                      </Show>
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      )}
    </Show>
  );
}
