import type { ComponentDef, CircuitGraph } from "../../features/calculator/domain/graph";
import { CALCULATOR_STAGES } from "../../features/calculator/domain/stages";
import { reconcileCalculatorDrafts } from "../../features/calculator/domain/reconcileDrafts";
import type { LocalProject } from "./specs";

export function reconcileCalculatorProject(
  project: LocalProject,
  originalLibrary: unknown[] = project.unlockedSubmodules,
): string[] {
  const { drafts, notices } = reconcileCalculatorDrafts(
    project.drafts as Record<string, CircuitGraph>,
    project.unlockedSubmodules,
    originalLibrary,
  );
  for (const [stage, draft] of Object.entries(drafts)) {
    if (draft === project.drafts[stage]) continue;
    project.drafts[stage] = draft;
    project.draftRevisions[stage] = (project.draftRevisions[stage] ?? 0) + 1;
  }
  return notices;
}

export function resetCalculatorLibrary(
  project: LocalProject,
  affected: (stage: number) => boolean,
): string[] {
  const removed = new Set(
    CALCULATOR_STAGES.filter((stage) => affected(stage.index)).map((stage) => stage.unlocks),
  );
  const original = project.unlockedSubmodules as ComponentDef[];
  let kept = CALCULATOR_STAGES.every((stage) => affected(stage.index))
    ? []
    : original.filter((component) => !removed.has(component.name));
  for (;;) {
    const names = new Set(kept.map((component) => component.name));
    const valid = kept.filter((component) =>
      component.graph.nodes.every(
        (node) => node.kind !== "component" || names.has(node.name ?? ""),
      ),
    );
    if (valid.length === kept.length) break;
    kept = valid;
  }
  project.unlockedSubmodules = kept;
  project.draftRevisions.components = (project.draftRevisions.components ?? 0) + 1;
  return reconcileCalculatorProject(project, original);
}
