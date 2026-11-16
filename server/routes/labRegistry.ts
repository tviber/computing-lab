import type { Hono } from "hono";
import type { LabId } from "../../src/shared/lab/labMetadata.ts";
import type { AppVariables } from "../http/context.ts";
import { calculatorRoutes } from "./calculator.ts";
import { colorQuantizationRoutes } from "./colorQuantization.ts";
import { decodingRoutes } from "./decoding.ts";
import { imageSamplingRoutes } from "./imageSampling.ts";
import { lunchShiftRoutes } from "./lunchShift.ts";
import { mlIntroRoutes } from "./mlIntro.ts";

/**
 * Every `LabId` in `labMetadata` must mount an API route factory here;
 * `server/index.ts` mounts them uniformly under `/api/classes/:classId/labs/<id>`.
 */
export const LAB_ROUTES: Record<LabId, () => Hono<{ Variables: AppVariables }>> = {
  calculator: calculatorRoutes,
  decoding: decodingRoutes,
  "lunch-shift": lunchShiftRoutes,
  "ml-intro": mlIntroRoutes,
  "image-sampling": imageSamplingRoutes,
  "color-quantization": colorQuantizationRoutes,
};
