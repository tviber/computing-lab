import type { SubmissionCheckProps } from "../../../shared/lab/submissionPresentation";
import { SubmissionFeedback } from "./SubmissionFeedback";

export function SubmissionCheck(props: SubmissionCheckProps) {
  return (
    <>
      {props.check.label}
      <small>
        <SubmissionFeedback
          detail={props.check.detail ?? ""}
          summary={props.summary ?? ""}
          feedback={props.check.feedback}
          answerSummary={props.check.answerSummary}
        />
      </small>
    </>
  );
}
