import { CALCULATOR_STAGES } from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph } from "../../src/features/calculator/domain/graph.ts";
import type { CalculatorJudgeResult } from "../../src/features/calculator/domain/protocol.ts";
import { judgeSubmission, saveDraft } from "../judge/run.ts";
import { labRoutes } from "./labRoutes.ts";

export function calculatorRoutes() {
  return labRoutes<CircuitGraph, CalculatorJudgeResult>({
    labId: "calculator",
    stageCount: CALCULATOR_STAGES.length,
    usesComponents: true,
    projectExtras: (_db, project) => ({ unlockedSubmodules: project.unlockedSubmodules }),
    saveDraft: (db, project, stageIndex, body, expectedRevision, expectedComponentsRevision) =>
      saveDraft(
        db,
        project,
        stageIndex,
        body.graph ?? {},
        body.components,
        expectedRevision,
        expectedComponentsRevision,
      ),
    judge: (db, project, stageIndex, body, { staff }) =>
      judgeSubmission(db, project, stageIndex, body.graph, body.components, { bypassLock: staff }),
  });
}
