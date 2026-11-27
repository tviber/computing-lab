import {
  evaluateCalculatorSubmission,
  mergeCustomComponents,
} from "../../src/features/calculator/lesson/judge.ts";
/**
 * Server-side judge: runs hidden test vectors against a submitted circuit
 * snapshot. Calculator-specific parts live here — contract checks, hidden
 * cases, component unlocks — while the shared pipeline (stage gate, draft
 * and submission persistence, stage advancement) comes from ./pipeline.ts.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  sanitizeGraph,
  type CircuitGraph,
  type ComponentDef,
} from "../../src/features/calculator/domain/graph.ts";
import type {
  CalculatorJudgeResult,
  CalculatorTestSummary,
} from "../../src/features/calculator/domain/protocol.ts";
import { nextMainlineStage } from "../../src/features/calculator/domain/stages.ts";
import { parseJsonColumn, withTransaction } from "../db/client.ts";
import {
  advanceStage,
  bumpComponentsRevision,
  insertSubmission,
  saveStageDraft,
  type DraftSaveResult,
  type LabJudgeError,
  type ProjectRow,
} from "./pipeline.ts";
import { hiddenTestsFor } from "./testcases.ts";

export type { CalculatorJudgeResult as JudgeOutcome, CalculatorTestSummary as TestSummary };

export function saveDraft(
  db: DatabaseSync,
  project: ProjectRow<CircuitGraph>,
  stageIndex: number,
  graph: unknown,
  rawComponents?: unknown,
  expectedRevision?: number,
  expectedComponentsRevision?: number,
  expectedGeneration?: number,
): DraftSaveResult {
  const submodules =
    rawComponents === undefined
      ? undefined
      : [...mergeCustomComponents(project.unlockedSubmodules as ComponentDef[], rawComponents)];
  // The component library is compare-and-swapped on its own revision inside
  // the same transaction: a stale list bounces the whole write (the stage
  // graph may reference the components it was drawn against).
  return saveStageDraft(db, project, stageIndex, sanitizeGraph(graph), {
    unlockedSubmodules: submodules,
    expectedRevision,
    expectedComponentsRevision,
    expectedGeneration,
  });
}

export function judgeSubmission(
  db: DatabaseSync,
  project: ProjectRow<CircuitGraph>,
  stageIndex: number,
  rawGraph: unknown,
  rawComponents?: unknown,
  options?: { bypassLock?: boolean },
): CalculatorJudgeResult | LabJudgeError {
  const evaluation = evaluateCalculatorSubmission(
    project,
    stageIndex,
    rawGraph,
    rawComponents,
    hiddenTestsFor(stageIndex),
    options,
  );
  if ("error" in evaluation) return evaluation;
  const { graph, stage, score, total, passed, testSummary } = evaluation;
  // Submission row + project progress are one write unit — a crash between
  // them would record a pass the student never got credit for.
  let currentStage = project.currentStage;
  let passedStages = project.passedStages;
  let unlockedComponent: string | null = null;
  let componentsRevision: number | null = null;
  let unlockedSubmodules: ComponentDef[] | null = null;
  const submissionId = withTransaction(db, () => {
    const submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: graph,
      score,
      total,
      passed,
      testSummary,
    });

    if (passed) {
      // The only library mutation a judge may make is the stage's own
      // unlock grant: re-read the server copy inside this transaction and
      // append the unlocked component. The submitted list stays out of the
      // write entirely — a stale tab's judgement can never shrink or
      // overwrite components another tab just saved (draft OCC owns them).
      let library: ComponentDef[] | undefined;
      if (stage.unlocks) {
        unlockedComponent = stage.unlocks;
        const unlockName = stage.unlocks.toLocaleLowerCase();
        const row = db
          .prepare("SELECT unlocked_submodules FROM student_projects WHERE id = ?")
          .get(project.id) as { unlocked_submodules: string } | undefined;
        const serverLibrary = parseJsonColumn<ComponentDef[]>(row?.unlocked_submodules, []);
        library = [
          ...serverLibrary.filter((s) => s.name.toLocaleLowerCase() !== unlockName),
          { name: stage.unlocks, graph },
        ];
      }
      const progress = advanceStage(
        db,
        project,
        stageIndex,
        nextMainlineStage,
        library === undefined ? undefined : { unlockedSubmodules: library },
      );
      currentStage = progress.currentStage;
      passedStages = progress.passedStages;
      if (library !== undefined) {
        componentsRevision = bumpComponentsRevision(db, project.id);
        // The authoritative library after this write: the client must
        // adopt it wholesale together with its revision — a bare revision
        // bump would let a stale local list claim it and clobber another
        // tab's components on the next save.
        unlockedSubmodules = library;
      }
    }
    return submissionId;
  });

  return {
    score,
    total,
    passed,
    testSummary,
    submissionId,
    currentStage,
    passedStages,
    unlockedComponent,
    componentsRevision,
    unlockedSubmodules,
  };
}
