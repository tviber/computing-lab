/** Presentation data for a single stored judge check. Raw answers remain plain text. */
export type SubmissionCheck = {
  id: string;
  label: string;
  detail?: string | null;
  feedback?: string;
  answerSummary?: string;
};

export type SubmissionCheckProps = {
  check: SubmissionCheck;
  summary?: string;
};
