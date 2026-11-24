import {
  CALCULATOR_STAGES,
  calculatorStageAffectedByReset,
} from "../../src/features/calculator/domain/stages.ts";
import {
  withoutNodes,
  type CircuitGraph,
  type ComponentDef,
} from "../../src/features/calculator/domain/graph.ts";
import type { CalculatorJudgeResult } from "../../src/features/calculator/domain/protocol.ts";
import { canAccessLab } from "../labs.ts";
import { jsonError, requireMembership } from "../http/context.ts";
import { judgeSubmission, saveDraft } from "../judge/run.ts";
import { labRoutes } from "./labRoutes.ts";

export function calculatorRoutes() {
  const app = labRoutes<CircuitGraph, CalculatorJudgeResult>({
    labId: "calculator",
    stageCount: CALCULATOR_STAGES.length,
    usesComponents: true,
    stageAffectedByReset: calculatorStageAffectedByReset,
    keepSubmodulesOnReset: (library, preservesStage) => {
      const removed = new Set(
        CALCULATOR_STAGES.filter((stage) => !preservesStage(stage.index)).map(
          (stage) => stage.unlocks,
        ),
      );
      let kept = (library as ComponentDef[]).filter((component) => !removed.has(component.name));
      for (;;) {
        const names = new Set(kept.map((component) => component.name));
        const valid = kept.filter((component) =>
          component.graph.nodes.every(
            (node) =>
              node.kind !== "component" || (node.name !== undefined && names.has(node.name)),
          ),
        );
        if (valid.length === kept.length) return kept;
        kept = valid;
      }
    },
    reconcileDrafts: (drafts, library) => {
      const known = new Set((library as ComponentDef[]).map((component) => component.name));
      const cleaned = { ...drafts };
      const notices: string[] = [];
      for (const [stage, graph] of Object.entries(drafts)) {
        if (!Array.isArray(graph?.nodes) || !Array.isArray(graph.edges)) continue;
        const missing = graph.nodes.filter(
          (node) => node.kind === "component" && !known.has(node.name ?? ""),
        );
        if (!missing.length) continue;
        cleaned[stage] = withoutNodes(graph, new Set(missing.map((node) => node.id)));
        const names = [...new Set(missing.map((node) => node.name ?? "未命名组件"))].join("、");
        notices.push(`第 ${stage} 关草稿已移除失效组件 ${names} 及其连线。`);
      }
      return { drafts: cleaned, notices };
    },
    projectExtras: (db, project) => ({
      unlockedSubmodules: project.unlockedSubmodules,
      fullAdderGuideAcknowledged: Boolean(
        db
          .prepare("SELECT 1 FROM calculator_full_adder_guide_acknowledgements WHERE user_id = ?")
          .get(project.userId),
      ),
    }),
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

  app.post("/guide/full-adder/acknowledge", (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    if (!canAccessLab(db, "calculator", auth.user)) {
      return jsonError(c, 403, "lab-not-available");
    }
    db.prepare(
      "INSERT OR IGNORE INTO calculator_full_adder_guide_acknowledgements (user_id) VALUES (?)",
    ).run(auth.user.id);
    return c.json({ ok: true });
  });

  return app;
}
