import type { PixelMatrix } from "../domain/bmp.ts";
import { generatePayload } from "../domain/payload.ts";
import type { DecodingJudgeResult, PartVerdict } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import {
  decodingStageUnlocked,
  getDecodingStage,
  type DecodingStageDef,
} from "../domain/stages.ts";
import {
  sanitizePixels,
  sanitizeText,
  sanitizeVerdicts,
  verifyArtifact,
} from "../domain/verify.ts";

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

import { gateStage, type JudgeProject, type LabJudgeError } from "../../../shared/lab/judging.ts";
export function evaluateDecodingSubmission(
  project: JudgeProject,
  stageIndex: number,
  body: { artifact?: unknown; code?: unknown; conceptAnswers?: Record<string, number> },
  options?: { bypassLock?: boolean },
) {
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

  return {
    result,
    snapshot: { artifact, code, conceptAnswers: body.conceptAnswers ?? {} },
    score,
    total: parts.length,
    passed,
    parts,
  };
}
