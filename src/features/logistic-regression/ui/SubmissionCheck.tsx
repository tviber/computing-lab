import { Show } from "solid-js";
import type { SubmissionCheckProps } from "../../../shared/lab/submissionPresentation";
import { MathText } from "../../../shared/ui/MathFormula";
import { isMathJudgePart } from "../domain/mathContent";

export function SubmissionCheck(props: SubmissionCheckProps) {
  return (
    <>
      <Show when={isMathJudgePart(props.check.id)} fallback={props.check.label}>
        <MathText>{props.check.label}</MathText>
      </Show>
      <Show when={props.check.detail}>
        {(detail) => (
          <small>
            <Show when={isMathJudgePart(props.check.id)} fallback={detail()}>
              <MathText>{detail()}</MathText>
            </Show>
          </small>
        )}
      </Show>
    </>
  );
}
