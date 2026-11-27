export type LabJudgeError = { error: string; status: number };

export type JudgeProject<TDraft = unknown> = {
  userId: string;
  labId: string;
  currentStage: number;
  passedStages: number[];
  unlockedSubmodules: unknown[];
  drafts: Record<string, TDraft>;
};

export function gateStage<TStage>(
  stage: TStage | undefined,
  unlocked: (stage: TStage) => boolean,
  options?: { bypassLock?: boolean },
): { stage: TStage } | LabJudgeError {
  if (!stage) return { error: "unknown-stage", status: 400 };
  if (!options?.bypassLock && !unlocked(stage)) return { error: "stage-locked", status: 409 };
  return { stage };
}

export type ReconcileDrafts<TDraft> = (
  drafts: Record<string, TDraft>,
  library: unknown[],
  originalLibrary: unknown[],
) => { drafts: Record<string, TDraft>; notices: string[] };
