import { LAB_IDS, labMetadata } from "../../../shared/lab/labMetadata";
import { APP_LABS, type AppLabEntry } from "../../labRegistry";
import type { LabOption } from "./types";

export const LAB_OPTIONS: LabOption[] = LAB_IDS.map((id) => {
  const appLab: AppLabEntry = APP_LABS[id];
  return {
    id,
    title: labMetadata[id].title,
    stages: appLab.dashboardStages,
    supportsCanvasPreview: appLab.supportsCanvasPreview ?? false,
    submissionCheck: appLab.submissionCheck,
  };
});
