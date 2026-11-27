import { isValidComponentIdentifier } from "../domain/componentize.ts";
import { runCases, type CaseResult } from "../domain/evaluate.ts";
import {
  findContractIssues,
  sanitizeGraph,
  type CircuitGraph,
  type ComponentDef,
} from "../domain/graph.ts";
import type { CalculatorTestSummary } from "../domain/protocol.ts";
import { getStage, stagePrerequisites } from "../domain/stages.ts";

import { gateStage, type JudgeProject } from "../../../shared/lab/judging.ts";
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

export function mergeCustomComponents(existing: ComponentDef[], raw: unknown): ComponentDef[] {
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

export function evaluateCalculatorSubmission(
  project: JudgeProject,
  stageIndex: number,
  rawGraph: unknown,
  rawComponents: unknown,
  cases: import("../domain/evaluate.ts").JudgeCase[],
  options?: { bypassLock?: boolean },
) {
  const gated = gateStage(
    getStage(stageIndex),
    (stage) => stagePrerequisites(stage).every((index) => project.passedStages.includes(index)),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const graph = sanitizeGraph(rawGraph);

  const evalSubmodules = [
    ...mergeCustomComponents(project.unlockedSubmodules as ComponentDef[], rawComponents),
  ];

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

  return { graph, stage, score, total, passed, testSummary };
}
