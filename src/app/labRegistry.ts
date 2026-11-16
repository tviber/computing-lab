import { lazyRouteComponent } from "@tanstack/react-router";
import { CALCULATOR_STAGES, CalculatorLabPage, coreStages } from "../features/calculator";
import { COLOR_QUANT_STAGES } from "../features/color-quantization";
import { DECODING_CORE_STAGES, DECODING_STAGES } from "../features/decoding";
import { IMAGE_SAMPLING_STAGES } from "../features/image-sampling";
import { LUNCH_STAGES } from "../features/lunch-shift";
import { ML_CORE_STAGES, ML_STAGES } from "../features/ml-intro";
import type { LabId } from "../shared/lab/labMetadata";

export type DashboardStage = {
  index: number;
  title: string;
  englishTitle?: string;
};

export type AppLabEntry = {
  /** Stages shown as columns in the class progress dashboard. */
  dashboardStages: readonly DashboardStage[];
  /** Core stage count shown on the homepage progress bar (null = no progress block). */
  homeProgressStages: number | null;
  /** Featured homepage card styling. */
  primaryCard?: true;
  /** Admin dashboard cells open the student canvas preview rather than a failure drawer. */
  supportsCanvasPreview?: true;
  /** Lab workspace component mounted at `/classes/$classId/labs/<id>`. */
  component: typeof CalculatorLabPage | ReturnType<typeof lazyRouteComponent>;
};

/**
 * Single frontend registration point for every lab in `labMetadata`: routes,
 * homepage cards, and teacher dashboard columns all read from here. Adding a
 * new `LabId` to `labMetadata` fails TypeScript compilation until wired here.
 */
export const APP_LABS = {
  calculator: {
    dashboardStages: CALCULATOR_STAGES,
    homeProgressStages: coreStages().length,
    primaryCard: true,
    supportsCanvasPreview: true,
    component: CalculatorLabPage,
  },
  decoding: {
    dashboardStages: DECODING_STAGES,
    homeProgressStages: DECODING_CORE_STAGES.length,
    component: lazyRouteComponent(() => import("../features/decoding"), "DecodingLabPage"),
  },
  "lunch-shift": {
    dashboardStages: LUNCH_STAGES,
    homeProgressStages: LUNCH_STAGES.length,
    component: lazyRouteComponent(() => import("../features/lunch-shift"), "LunchShiftLabPage"),
  },
  "ml-intro": {
    dashboardStages: ML_STAGES,
    homeProgressStages: ML_CORE_STAGES.length,
    component: lazyRouteComponent(() => import("../features/ml-intro"), "MlIntroLabPage"),
  },
  "image-sampling": {
    dashboardStages: IMAGE_SAMPLING_STAGES,
    homeProgressStages: null,
    component: lazyRouteComponent(
      () => import("../features/image-sampling"),
      "ImageSamplingLabPage",
    ),
  },
  "color-quantization": {
    dashboardStages: COLOR_QUANT_STAGES,
    homeProgressStages: null,
    component: lazyRouteComponent(
      () => import("../features/color-quantization"),
      "ColorQuantizationLabPage",
    ),
  },
} satisfies Record<LabId, AppLabEntry>;
