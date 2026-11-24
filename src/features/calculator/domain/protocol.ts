/**
 * Wire protocol between the calculator UI and the server judge. Shared by
 * `server/judge/run.ts` (producer) and the lab page (consumer) so the payload
 * shapes live exactly once.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { Bit, CircuitGraph, ComponentDef } from "./graph.ts";

/** POST /judge body: the graph to grade plus the learner's component library. */
export type CalculatorSubmission = {
  stageIndex: number;
  graph: CircuitGraph;
  components?: ComponentDef[];
};

export type CalculatorTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing hidden case, in runCases order; null on a full pass. */
  counterexample: {
    name: string;
    category: string;
    inputs: Record<string, Bit>;
    expected: Record<string, Bit>;
    actual: Record<string, Bit | null>;
  } | null;
  error: string | null;
};

export type CalculatorJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: CalculatorTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: string | null;
  /** Library revision after the judgement's own write — the client's next
   *  components-carrying save compares against it (null when the library
   *  was untouched). */
  componentsRevision: number | null;
  /** The full authoritative component library after the judgement's write
   *  — set exactly when the library mutated (same condition as
   *  componentsRevision). The client adopts this snapshot together with
   *  the revision; a revision never travels without its snapshot. */
  unlockedSubmodules: ComponentDef[] | null;
};

/** GET /project payload: the generic lab envelope plus unlocked components. */
export type CalculatorProjectPayload = LabProjectPayload<CircuitGraph> & {
  unlockedSubmodules: ComponentDef[];
  fullAdderGuideAcknowledged: boolean;
  draftNotices?: string[];
};
