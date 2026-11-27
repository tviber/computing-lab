import { api, ApiError, describeApiError } from "../../shared/api/client";
import { LabRuntimeError, type LabTransport } from "../../shared/lab/contracts";

async function translate<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw new LabRuntimeError(
      error instanceof ApiError ? error.code : "offline",
      describeApiError(error),
    );
  }
}

const path = (scopeId: string, labId: string) =>
  `/api/classes/${encodeURIComponent(scopeId)}/labs/${encodeURIComponent(labId)}`;

export const classroomTransport: LabTransport = {
  load: (scopeId, labId) => translate(api.get(`${path(scopeId, labId)}/project`)),
  save: (scopeId, labId, body) => translate(api.put(`${path(scopeId, labId)}/draft`, body)),
  judge: (scopeId, labId, body) => translate(api.post(`${path(scopeId, labId)}/judge`, body)),
  reset: (scopeId, labId, body) => translate(api.post(`${path(scopeId, labId)}/reset`, body)),
  acknowledgeGuide: (scopeId) =>
    translate(api.post(`${path(scopeId, "calculator")}/guide/full-adder/acknowledge`)),
};
