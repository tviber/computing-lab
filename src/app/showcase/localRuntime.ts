import { LabRuntimeError, type LabTransport } from "../../shared/lab/contracts";
import { LAB_IDS, type LabId } from "../../shared/lab/labMetadata";
import type { LabRuntime } from "../../shared/lab/runtime";
import type { LocalProject } from "./specs";

export const LOCAL_LEARNER_ID = "local-learner-v1";
const prefix = "computing-lab:project:v1:";
const LUNCH_SUMMARY_KEYS: Partial<Record<number, string>> = {
  2: "intake",
  3: "queue",
  4: "final",
  5: "compensate",
};

function read(storage: Storage, labId: LabId): LocalProject {
  const raw = storage.getItem(prefix + labId);
  if (raw) {
    try {
      const value = JSON.parse(raw) as LocalProject;
      if (
        value.labId === labId &&
        Array.isArray(value.passedStages) &&
        value.drafts &&
        value.draftRevisions &&
        Number.isInteger(value.projectGeneration)
      )
        return value;
    } catch {
      throw new LabRuntimeError(
        "invalid-local-project",
        "本地进度无法读取，请备份浏览器存储后重试。",
      );
    }
    throw new LabRuntimeError("invalid-local-project", "本地进度格式无效。");
  }
  return {
    userId: LOCAL_LEARNER_ID,
    labId,
    currentStage: 1,
    passedStages: [],
    drafts: {},
    draftRevisions: {},
    projectGeneration: 0,
    unlockedSubmodules: [],
    runSummaries: {},
  };
}

export function createLocalTransport(storage: Storage): LabTransport {
  async function operate<T>(
    lab: string,
    operation: "load" | "save" | "judge" | "reset" | "guide",
    body: Record<string, unknown> = {},
  ): Promise<T> {
    if (!LAB_IDS.includes(lab as LabId)) throw new LabRuntimeError("unknown-lab");
    const labId = lab as LabId;
    const { localSpecs, mergeCustomComponents } = await import("./specs");
    const spec = localSpecs[labId];
    const run = () => {
      const project = read(storage, labId);
      const payload = () => ({ ...project, staffFreeNavigation: false, ...spec.extras?.(project) });
      const persist = () => {
        try {
          storage.setItem(prefix + labId, JSON.stringify(project));
        } catch {
          throw new LabRuntimeError(
            "local-storage-full",
            "浏览器无法保存进度，请检查可用存储空间与网站权限。",
          );
        }
      };
      if (operation === "load") {
        if (calculatorProject) {
          const draftNotices = calculatorProject.reconcileCalculatorProject(project);
          if (draftNotices.length) persist();
          return { ...payload(), ...(draftNotices.length ? { draftNotices } : {}) };
        }
        return payload();
      }
      if (operation === "guide") {
        project.fullAdderGuideAcknowledged = true;
        persist();
        return { ok: true };
      }
      if (operation === "save" && body.expectedGeneration !== project.projectGeneration) {
        return {
          applied: false,
          revision: project.draftRevisions[String(body.stageIndex)] ?? 0,
          componentsRevision: project.draftRevisions.components ?? 0,
          projectGeneration: project.projectGeneration,
        };
      }
      if (body.expectedGeneration !== project.projectGeneration)
        throw new LabRuntimeError("stale-project-generation", "进度已在另一页面重置，请重新载入。");
      const stage = Number(body.stageIndex);
      if (
        !(operation === "reset" && body.scope === "lab") &&
        !spec.stages.some((entry) => entry.index === stage)
      )
        throw new LabRuntimeError("invalid-stage");
      if (operation === "save") {
        const revision = project.draftRevisions[stage] ?? 0;
        const componentsRevision = project.draftRevisions.components ?? 0;
        if (
          body.expectedRevision !== revision ||
          (body.components !== undefined && body.expectedComponentsRevision !== componentsRevision)
        )
          return {
            applied: false,
            revision,
            componentsRevision,
            projectGeneration: project.projectGeneration,
          };
        project.drafts[stage] = spec.sanitize(stage, body);
        project.draftRevisions[stage] = revision + 1;
        if (labId === "calculator" && body.components !== undefined) {
          const originalLibrary = project.unlockedSubmodules;
          project.unlockedSubmodules = mergeCustomComponents(
            project.unlockedSubmodules as Parameters<typeof mergeCustomComponents>[0],
            body.components,
          );
          project.draftRevisions.components = componentsRevision + 1;
          calculatorProject?.reconcileCalculatorProject(project, originalLibrary);
        }
        persist();
        return {
          applied: true,
          revision: project.draftRevisions[stage],
          componentsRevision: project.draftRevisions.components,
          projectGeneration: project.projectGeneration,
        };
      }
      if (operation === "reset") {
        if (body.scope !== "stage" && body.scope !== "lab")
          throw new LabRuntimeError("invalid-reset-scope");
        const affected = (index: number) =>
          body.scope === "lab" || (spec.affected?.(stage, index) ?? index >= stage);
        project.passedStages = project.passedStages.filter((index) => !affected(index));
        for (const entry of spec.stages)
          if (affected(entry.index)) {
            delete project.drafts[entry.index];
            project.draftRevisions[entry.index] = (project.draftRevisions[entry.index] ?? 0) + 1;
            delete project.runSummaries[`s${entry.index}`];
            const summaryKey = LUNCH_SUMMARY_KEYS[entry.index];
            if (summaryKey) delete project.runSummaries[summaryKey];
          }
        if (affected(4)) delete project.trainedSettings;
        const draftNotices = calculatorProject
          ? calculatorProject.resetCalculatorLibrary(project, affected)
          : [];
        project.currentStage = spec.next(project.passedStages);
        project.projectGeneration += 1;
        persist();
        return { ...payload(), ...(draftNotices.length ? { draftNotices } : {}) };
      }
      const outcome = spec.evaluate(project, stage, body);
      if ("error" in outcome) throw new LabRuntimeError(String(outcome.error));
      if (outcome.passed) {
        project.passedStages = [...new Set([...project.passedStages, stage])].sort(
          (left, right) => left - right,
        );
        project.currentStage = spec.next(project.passedStages);
        if (outcome.trainedSettings)
          project.trainedSettings = outcome.trainedSettings as LocalProject["trainedSettings"];
      }
      if (outcome.testSummary) {
        project.runSummaries[`s${stage}`] = outcome.testSummary;
        const summaryKey = LUNCH_SUMMARY_KEYS[stage];
        if (labId === "lunch-shift" && summaryKey)
          project.runSummaries[summaryKey] = outcome.testSummary;
      }
      persist();
      return {
        ...outcome,
        submissionId: crypto.randomUUID(),
        currentStage: project.currentStage,
        passedStages: project.passedStages,
        ...spec.extras?.(project),
      };
    };
    const calculatorProject =
      labId === "calculator" ? await import("./resetCalculator") : undefined;
    return (
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request(prefix + labId, run)
        : run()
    ) as T;
  }
  return {
    load: (_scope, lab) => operate(lab, "load"),
    save: (_scope, lab, body) => operate(lab, "save", body),
    judge: (_scope, lab, body) => operate(lab, "judge", body),
    reset: (_scope, lab, body) => operate(lab, "reset", body),
    acknowledgeGuide: () => operate("calculator", "guide"),
  };
}

export function createLocalRuntime(storage: Storage): LabRuntime {
  return {
    scopeId: "browser",
    learnerId: LOCAL_LEARNER_ID,
    ready: true,
    freeNavigation: false,
    transport: createLocalTransport(storage),
  };
}
