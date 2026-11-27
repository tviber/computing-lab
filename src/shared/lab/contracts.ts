export type LabProjectPayload<TDraft> = {
  labId: string;
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, TDraft>;
  draftRevisions?: Record<string, number>;
  projectGeneration?: number;
  staffFreeNavigation?: boolean;
};

export type SaveStatus =
  "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "sync-error";

export class LabRuntimeError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

export function describeRuntimeError(error: unknown): string {
  return error instanceof Error ? error.message : "实验操作失败，请重试。";
}

export type LabTransport = {
  load<T>(scopeId: string, labId: string): Promise<T>;
  save<T>(scopeId: string, labId: string, body: Record<string, unknown>): Promise<T>;
  judge<T>(scopeId: string, labId: string, body: Record<string, unknown>): Promise<T>;
  reset<T>(scopeId: string, labId: string, body: Record<string, unknown>): Promise<T>;
  acknowledgeGuide(scopeId: string): Promise<unknown>;
};
