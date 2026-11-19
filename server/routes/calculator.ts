import { CALCULATOR_STAGES } from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph, ComponentDef } from "../../src/features/calculator/domain/graph.ts";
import type { CalculatorJudgeResult } from "../../src/features/calculator/domain/protocol.ts";
import { judgeSubmission, saveDraft } from "../judge/run.ts";
import { labRoutes } from "./labRoutes.ts";

export function calculatorRoutes() {
  return labRoutes<CircuitGraph, CalculatorJudgeResult>({
    labId: "calculator",
    stageCount: CALCULATOR_STAGES.length,
    usesComponents: true,
    keepSubmodulesOnReset: (library, fromStage) => {
      const removed = new Set(CALCULATOR_STAGES.slice(fromStage - 1).map((stage) => stage.unlocks));
      return (library as ComponentDef[]).filter(
        (component) => component.custom || !removed.has(component.name),
      );
    },
    projectExtras: (_db, project) => ({ unlockedSubmodules: project.unlockedSubmodules }),
    saveDraft: (
      db,
      project,
      stageIndex,
      body,
      expectedRevision,
      expectedComponentsRevision,
      expectedGeneration,
    ) =>
      saveDraft(
        db,
        project,
        stageIndex,
        body.graph ?? {},
        body.components,
        expectedRevision,
        expectedComponentsRevision,
        expectedGeneration,
      ),
    judge: (db, project, stageIndex, body, { staff }) =>
      judgeSubmission(db, project, stageIndex, body.graph, body.components, { bypassLock: staff }),
  });
}
