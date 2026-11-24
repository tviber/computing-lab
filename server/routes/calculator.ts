import {
  CALCULATOR_STAGES,
  calculatorStageAffectedByReset,
} from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph, ComponentDef } from "../../src/features/calculator/domain/graph.ts";
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
