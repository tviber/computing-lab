import { createMemo, Show } from "solid-js";
import { MathText } from "../../../shared/ui/MathFormula";

/** The judge appends the raw answer summary in parentheses. It must stay literal. */
export function SubmissionFeedback(props: { detail: string; summary: string }) {
  const suffix = () => `（${props.summary}）`;
  const feedback = createMemo(() =>
    props.summary && props.detail.endsWith(suffix())
      ? props.detail.slice(0, -suffix().length)
      : null,
  );
  return (
    <Show when={feedback() !== null} fallback={props.detail}>
      <MathText>{feedback()!}</MathText>
      {suffix()}
    </Show>
  );
}
