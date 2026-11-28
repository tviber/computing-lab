import { lazy, type Component } from "solid-js";
import { CALCULATOR_STAGES, coreStages } from "../features/calculator/domain/stages";
import { COLOR_QUANT_STAGES } from "../features/color-quantization/domain/stages";
import { DECODING_CORE_STAGES, DECODING_STAGES } from "../features/decoding/domain/stages";
import { IMAGE_SAMPLING_STAGES } from "../features/image-sampling/domain/stages";
import { LUNCH_STAGES } from "../features/lunch-shift/domain/stages";
import { LOGISTIC_REGRESSION_CORE_STAGES } from "../features/logistic-regression/domain/stages";
import { STATS_FOUNDATIONS_STAGES } from "../features/stats-foundations/domain/stages";
import type { SubmissionCheckProps } from "../shared/lab/submissionPresentation";
import type { LabId } from "../shared/lab/labMetadata";

export type DashboardStage = {
  index: number;
  title: string;
  englishTitle?: string;
};

export type LazyLabComponent = Component & {
  preload: () => Promise<unknown>;
};

export type AppLabEntry = {
  dashboardStages: readonly DashboardStage[];
  homeProgressStages: number | null;
  supportsCanvasPreview?: true;
  submissionCheck?: Component<SubmissionCheckProps>;
  component: LazyLabComponent;
};

export const APP_LABS = {
  calculator: {
    dashboardStages: CALCULATOR_STAGES,
    homeProgressStages: coreStages().length,
    supportsCanvasPreview: true,
    component: lazy(() => import("../features/calculator/ui/CalculatorLabPage"), {
      export: "CalculatorLabPage",
    }),
  },
  decoding: {
    dashboardStages: DECODING_STAGES,
    homeProgressStages: DECODING_CORE_STAGES.length,
    component: lazy(() => import("../features/decoding/ui/DecodingLabPage"), {
      export: "DecodingLabPage",
    }),
  },
  "lunch-shift": {
    dashboardStages: LUNCH_STAGES,
    homeProgressStages: LUNCH_STAGES.length,
    component: lazy(() => import("../features/lunch-shift/ui/LunchShiftLabPage"), {
      export: "LunchShiftLabPage",
    }),
  },
  "stats-foundations": {
    submissionCheck: lazy(() => import("../features/stats-foundations/ui/SubmissionCheck"), {
      export: "SubmissionCheck",
    }),
    dashboardStages: STATS_FOUNDATIONS_STAGES,
    homeProgressStages: STATS_FOUNDATIONS_STAGES.length,
    component: lazy(() => import("../features/stats-foundations/ui/StatsFoundationsLabPage"), {
      export: "StatsFoundationsLabPage",
    }),
  },
  "logistic-regression": {
    submissionCheck: lazy(() => import("../features/logistic-regression/ui/SubmissionCheck"), {
      export: "SubmissionCheck",
    }),
    dashboardStages: LOGISTIC_REGRESSION_CORE_STAGES,
    homeProgressStages: LOGISTIC_REGRESSION_CORE_STAGES.length,
    component: lazy(() => import("../features/logistic-regression/ui/LogisticRegressionLabPage"), {
      export: "LogisticRegressionLabPage",
    }),
  },
  "image-sampling": {
    dashboardStages: IMAGE_SAMPLING_STAGES,
    homeProgressStages: null,
    component: lazy(() => import("../features/image-sampling/ui/ImageSamplingLabPage"), {
      export: "ImageSamplingLabPage",
    }),
  },
  "color-quantization": {
    dashboardStages: COLOR_QUANT_STAGES,
    homeProgressStages: null,
    component: lazy(() => import("../features/color-quantization/ui/ColorQuantizationLabPage"), {
      export: "ColorQuantizationLabPage",
    }),
  },
} satisfies Record<LabId, AppLabEntry>;
