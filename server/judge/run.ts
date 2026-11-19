/**
 * Server-side judge: runs hidden test vectors against a submitted circuit
 * snapshot. Calculator-specific parts live here — contract checks, hidden
 * cases, component unlocks — while the shared pipeline (stage gate, draft
 * and submission persistence, stage advancement) comes from ./pipeline.ts.
 */

import type { DatabaseSync } from "node:sqlite";
import { runCases, type CaseResult } from "../../src/features/calculator/domain/evaluate.ts";
import { isValidComponentIdentifier } from "../../src/features/calculator/domain/componentize.ts";
import {
  findContractIssues,
  sanitizeGraph,
  type CircuitGraph,
  type ComponentDef,
} from "../../src/features/calculator/domain/graph.ts";
import {
  getStage,
  nextMainlineStage,
  stagePrerequisites,
} from "../../src/features/calculator/domain/stages.ts";
import type {
  CalculatorJudgeResult,
  CalculatorTestSummary,
} from "../../src/features/calculator/domain/protocol.ts";
import { parseJsonColumn, withTransaction } from "../db/client.ts";
import {
  advanceStage,
  bumpComponentsRevision,
  insertSubmission,
  saveStageDraft,
  gateStage,
  type DraftSaveResult,
  type LabJudgeError,
  type ProjectRow,
} from "./pipeline.ts";
import { hiddenTestsFor } from "./testcases.ts";

export type { CalculatorJudgeResult as JudgeOutcome, CalculatorTestSummary as TestSummary };

function componentMap(submodules: ComponentDef[]): Record<string, CircuitGraph> {
  return Object.fromEntries(submodules.map((s) => [s.name, s.graph]));
}

function submittedCustomComponents(raw: unknown): ComponentDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value): ComponentDef[] => {
    if (!value || typeof value !== "object") return [];
    const candidate = value as { name?: unknown; graph?: unknown; custom?: unknown };
    if (
      candidate.custom !== true ||
      typeof candidate.name !== "string" ||
      !isValidComponentIdentifier(candidate.name)
    ) {
      return [];
    }
    return [{ name: candidate.name.trim(), graph: sanitizeGraph(candidate.graph), custom: true }];
  });
}

/**
 * The server owns stage-unlocked components. Learner-made components may be
 * added or updated, but a request can never replace an official component.
 */
function mergeCustomComponents(existing: ComponentDef[], raw: unknown): ComponentDef[] {
  // Omitting components means "leave the saved component library alone".
  // When the client sends the list, it is authoritative for learner-made
  // components so that deleting one can be persisted by autosave.
  if (raw === undefined) return existing;

  const officialNames = new Set(
    existing
      .filter((component) => !component.custom)
      .map((component) => component.name.toLocaleLowerCase()),
  );
  const submitted = submittedCustomComponents(raw).filter(
    (component) => !officialNames.has(component.name.toLocaleLowerCase()),
  );
  const submittedByName = new Map(
    submitted.map((component) => [component.name.toLocaleLowerCase(), component]),
  );
  const merged: ComponentDef[] = [];

  for (const component of existing) {
    if (!component.custom) {
      merged.push(component);
      continue;
    }
    const replacement = submittedByName.get(component.name.toLocaleLowerCase());
    if (replacement) {
      merged.push(replacement);
      submittedByName.delete(component.name.toLocaleLowerCase());
    }
  }

  merged.push(...submittedByName.values());
  return merged;
}

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
  // Core stages are always judgeable in any order; optional stages declare
  // their own local prerequisite, with legacy challenges defaulting to all
  // core stages (bypassed in staff demo/exploration mode).
  const gated = gateStage(
    getStage(stageIndex),
    (stage) => stagePrerequisites(stage).every((index) => project.passedStages.includes(index)),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const graph = sanitizeGraph(rawGraph);
  // The submitted component list is evaluation input only — the circuit may
  // reference learner-made components not yet autosaved, so judging runs
  // against the merged view. It is never written back: the library's
  // authoritative copy is re-read inside the write transaction below.
  const evalSubmodules = [
    ...mergeCustomComponents(project.unlockedSubmodules as ComponentDef[], rawComponents),
  ];
  const cases = hiddenTestsFor(stageIndex);
  // Structural gate before any truth-table work: a graph whose contract is
  // already broken (missing/undriven pins, multi-driven ports) fails here
  // with a readable reason instead of "losing" a percentage of cases.
  const structureIssues = findContractIssues(graph, stage.inputs, stage.outputs);
  const { results, score, total } = structureIssues.length
    ? { results: [] as CaseResult[], score: 0, total: cases.length }
    : runCases(graph, cases, componentMap(evalSubmodules));

  const categories: CalculatorTestSummary["categories"] = {};
  for (const r of results as CaseResult[]) {
    const bucket = (categories[r.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (r.passed) bucket.passed += 1;
  }
  const firstError = results.find((r) => r.error)?.error;
  const failIndex = results.findIndex((r) => !r.passed);
  const testSummary: CalculatorTestSummary = {
    categories,
    results: results.map((r) => ({ name: r.name, category: r.category, passed: r.passed })),
    counterexample:
      failIndex >= 0
        ? {
            name: results[failIndex].name,
            category: results[failIndex].category,
            inputs: cases[failIndex].inputs,
            expected: results[failIndex].expected,
            actual: results[failIndex].actual,
          }
        : null,
    error: structureIssues.length
      ? `结构问题：${structureIssues.join("；")}`
      : firstError
        ? `${firstError.kind}: ${firstError.detail}`
        : null,
  };
  const passed = score === total && total > 0;

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
