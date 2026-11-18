/**
 * Decoding judge. The student submits data — the decoded artifact plus
 * concept answers and a code snapshot — never executable code. The server
 * re-derives this student's payload from (userId, labId, stageIndex), runs
 * the same reference decode the browser was told about only through its
 * payload, and compares. Details name the first mismatching position only:
 * enough to debug a decoder, not enough to leak the answer.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  DecodingDraft,
  DecodingJudgeResult,
  PartVerdict,
} from "../../../src/features/decoding/domain/protocol.ts";
import { generatePayload } from "../../../src/features/decoding/domain/payload.ts";
import { seedFor } from "../../../src/features/decoding/domain/rng.ts";
import {
  decodingStageUnlocked,
  getDecodingStage,
  nextDecodingStage,
  type DecodingStageDef,
} from "../../../src/features/decoding/domain/stages.ts";
import {
  sanitizePixels,
  sanitizeText,
  sanitizeVerdicts,
  verifyArtifact,
} from "../../../src/features/decoding/domain/verify.ts";
import type { PixelMatrix } from "../../../src/features/decoding/domain/bmp.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

/**
 * Concept prompts are re-checked server-side — the client only sends picks.
 * Each prompt becomes its own part so a wrong pick lands in the verdict list
 * (and teacher snapshot) instead of an opaque 400; details name the prompt,
 * never the correct option.
 */
function promptParts(
  stage: DecodingStageDef,
  answers: Record<string, number> | undefined,
): PartVerdict[] {
  return (stage.prompts ?? []).map((prompt, i) => ({
    id: `prompt-${prompt.id}`,
    label: `概念题 ${i + 1}`,
    ok: prompt.options[answers?.[prompt.id] ?? -1]?.correct === true,
    detail:
      prompt.options[answers?.[prompt.id] ?? -1]?.correct === true
        ? null
        : "还没答对——回到「先想清楚」再看看",
  }));
}

type CleanArtifact =
  | { text: string }
  | { pixels: PixelMatrix }
  | { verdicts: NonNullable<ReturnType<typeof sanitizeVerdicts>> };

/**
 * Bound the submitted artifact to the stage's shape. Junk structure is a
 * 400 — the honest "wrong answer" path still lands in the verdicts list.
 */
function cleanArtifact(
  stage: DecodingStageDef,
  raw: unknown,
  fileCount: number,
): CleanArtifact | LabJudgeError {
  const artifact = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (stage.kind) {
    case "codes":
    case "bits":
    case "bmp-script": {
      const text = sanitizeText(artifact.text);
      if (!text) return { error: "malformed-artifact", status: 400 };
      return { text };
    }
    case "bmp": {
      const pixels = sanitizePixels(artifact.pixels);
      if (!pixels) return { error: "malformed-artifact", status: 400 };
      return { pixels };
    }
    case "files": {
      const verdicts = sanitizeVerdicts(artifact.verdicts);
      if (!verdicts || verdicts.length !== fileCount) {
        return { error: "malformed-artifact", status: 400 };
      }
      return { verdicts };
    }
  }
}

export function judgeDecodingSubmission(
  db: DatabaseSync,
  project: ProjectRow<DecodingDraft>,
  stageIndex: number,
  body: { artifact?: unknown; code?: unknown; conceptAnswers?: Record<string, number> },
  options?: { bypassLock?: boolean },
): DecodingJudgeResult | LabJudgeError {
  const gated = gateStage(
    getDecodingStage(stageIndex),
    (stage) => decodingStageUnlocked(project.passedStages, stage.index),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const concepts = promptParts(stage, body.conceptAnswers);

  const seed = seedFor(project.userId, project.labId, stage.index);
  const { payload, expected } = generatePayload(stage, seed);
  const fileCount = payload.kind === "files" ? payload.files.length : 0;

  const artifact = cleanArtifact(stage, body.artifact, fileCount);
  if ("error" in artifact) return artifact;

  const parts = [...concepts, ...verifyArtifact(stage, artifact, expected)];
  const passed = parts.every((part) => part.ok);
  const score = parts.filter((part) => part.ok).length;

  const code = typeof body.code === "string" ? body.code.slice(0, 12000) : "";

  const result: DecodingJudgeResult = {
    passed,
    parts,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
  };

  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: { artifact, code, conceptAnswers: body.conceptAnswers ?? {} },
      score,
      total: parts.length,
      passed,
      testSummary: { parts },
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextDecodingStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
