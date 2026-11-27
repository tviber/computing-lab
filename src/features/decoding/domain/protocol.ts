/**
 * Wire protocol between the decoding lab UI and the server judge.
 * The submission is data only — a decoded artifact plus the concept answers
 * and an optional source-code snapshot for teacher review. Student code is
 * never executed server-side; the server regenerates the per-user payload
 * and compares the artifact against its own reference decode.
 */

import type { LabProjectPayload } from "../../../shared/lab/contracts.ts";
import type { PixelMatrix } from "./bmp.ts";

export type DecoderChoice = "text" | "image";

/** A mystery file descriptor shown to the student (no type label by design). */
export type LabFile = { id: string; meta: string; bytes: number[] };

/** What the client needs to render a stage's payload — sent via project extras. */
export type LabPayload =
  | { kind: "codes"; codes: number[] }
  | { kind: "bits"; groups: string[] }
  | { kind: "bmp"; bytes: number[]; width: number; height: number }
  | { kind: "files"; files: LabFile[] };

/** Per-stage student work; persisted in the generic draft_graph column. */
export type DecodingDraft = {
  code: string;
  /** Cloze stages: blankId → student's fill; assembled back into code at run/submit. */
  fills: Record<string, string>;
  /** promptId → picked option index (verified server-side at judge time). */
  conceptAnswers: Record<string, number>;
  /** Stage 4: per-file decoder choice + the artifact that decoder produced. */
  verdicts: ({ decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null)[];
};

export type DecodingSubmission = {
  stageIndex: number;
  /**
   * Stage-specific decoded result:
   *   codes/bits/bmp-script → { text }
   *   bmp                   → { pixels }
   *   files                 → { verdicts: FileVerdict-shaped list }
   */
  artifact: unknown;
  /** Optional snapshot of the student's decoder source; never executed. */
  code?: string;
  conceptAnswers?: Record<string, number>;
};

/** One checked part of a submission — pixels, a file's choice… */
export type PartVerdict = {
  id: string;
  label: string;
  ok: boolean;
  /** Where it first went wrong, when applicable — never the full answer. */
  detail: string | null;
};

export type DecodingJudgeResult = {
  passed: boolean;
  parts: PartVerdict[];
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};

/** GET /project payload: the generic envelope plus per-user stage payloads. */
export type DecodingProjectPayload = LabProjectPayload<DecodingDraft> & {
  payloads: Record<number, LabPayload>;
};
