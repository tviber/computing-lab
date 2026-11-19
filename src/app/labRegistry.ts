import { lazyRouteComponent } from "@tanstack/react-router";
import { CALCULATOR_STAGES, coreStages } from "../features/calculator/domain/stages";
import { COLOR_QUANT_STAGES } from "../features/color-quantization/domain/stages";
import { DECODING_CORE_STAGES, DECODING_STAGES } from "../features/decoding/domain/stages";
import { IMAGE_SAMPLING_STAGES } from "../features/image-sampling/domain/stages";
import { LUNCH_STAGES } from "../features/lunch-shift/domain/stages";
import {
  LOGISTIC_REGRESSION_CORE_STAGES,
  LOGISTIC_REGRESSION_STAGES,
} from "../features/logistic-regression/domain/stages";
import type { LabId } from "../shared/lab/labMetadata";

export type DashboardStage = {
  index: number;
  title: string;
  englishTitle?: string;
};

export type AppLabEntry = {
  dashboardStages: readonly DashboardStage[];
  homeProgressStages: number | null;
  primaryCard?: true;
  supportsCanvasPreview?: true;
  component: ReturnType<typeof lazyRouteComponent>;
};

export const APP_LABS = {
  calculator: {
    dashboardStages: CALCULATOR_STAGES,
    homeProgressStages: coreStages().length,
    primaryCard: true,
    supportsCanvasPreview: true,
    component: lazyRouteComponent(
      () => import("../features/calculator/ui/CalculatorLabPage"),
      "CalculatorLabPage",
    ),
  },
  decoding: {
    dashboardStages: DECODING_STAGES,
    homeProgressStages: DECODING_CORE_STAGES.length,
    component: lazyRouteComponent(
      () => import("../features/decoding/ui/DecodingLabPage"),
      "DecodingLabPage",
    ),
  },
  "lunch-shift": {
    dashboardStages: LUNCH_STAGES,
    homeProgressStages: LUNCH_STAGES.length,
    component: lazyRouteComponent(
      () => import("../features/lunch-shift/ui/LunchShiftLabPage"),
      "LunchShiftLabPage",
    ),
  },
  "logistic-regression": {
    dashboardStages: LOGISTIC_REGRESSION_STAGES,
    homeProgressStages: LOGISTIC_REGRESSION_CORE_STAGES.length,
    component: lazyRouteComponent(
      () => import("../features/logistic-regression/ui/LogisticRegressionLabPage"),
      "LogisticRegressionLabPage",
    ),
  },
  "image-sampling": {
    dashboardStages: IMAGE_SAMPLING_STAGES,
    homeProgressStages: null,
    component: lazyRouteComponent(
      () => import("../features/image-sampling/ui/ImageSamplingLabPage"),
      "ImageSamplingLabPage",
    ),
  },
  "color-quantization": {
    dashboardStages: COLOR_QUANT_STAGES,
    homeProgressStages: null,
    component: lazyRouteComponent(
      () => import("../features/color-quantization/ui/ColorQuantizationLabPage"),
      "ColorQuantizationLabPage",
    ),
  },
} satisfies Record<LabId, AppLabEntry>;
