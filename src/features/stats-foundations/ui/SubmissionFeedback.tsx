import { createMemo, Show } from "solid-js";
import { MathText } from "../../../shared/ui/MathFormula";

/** Legacy records have no trusted field boundary. Show authored TeX as plain text,
 * without interpreting the whole record (which can contain student answers).
 */
function legacyPlainText(detail: string): string {
  return detail.replace(/\$([^$\n]+)\$/g, (marked, formula: string) => {
    if (
      !/^(?:P\(\\text\{真下雨\}(?:\\mid\\text\{预报下雨\})?\)|P\(\\text\{预报下雨\}\\mid\\text\{真下雨\}\)|\\mathrm\{MSE\} = [\d.]+|p(?: = |\\approx )[\d.]+|-b\/w|w)$/.test(
        formula,
      )
    )
      return marked;
    return formula
      .replace(/\\(?:text|mathrm)\{([^}]+)\}/g, "$1")
      .replace(/\\mid/g, " | ")
      .replace(/\\approx/g, "≈");
  });
}

export function SubmissionFeedback(props: {
  detail: string;
  summary: string;
  feedback?: string;
  answerSummary?: string;
}) {
  const content = createMemo(() => {
    if (props.feedback !== undefined) {
      return { feedback: props.feedback, summary: props.answerSummary ?? "" };
    }
    // Compatibility with the original concatenated format. Never parse answers as TeX.
    const suffix = `（${props.summary}）`;
    if (props.summary && props.detail.endsWith(suffix)) {
      return { feedback: props.detail.slice(0, -suffix.length), summary: props.summary };
    }
    return null;
  });
  return (
    <Show when={content()} fallback={legacyPlainText(props.detail)}>
      {(value) => (
        <>
          <MathText>{value().feedback}</MathText>
          <Show when={value().summary}>{(summary) => <>（{summary()}）</>}</Show>
        </>
      )}
    </Show>
  );
}
