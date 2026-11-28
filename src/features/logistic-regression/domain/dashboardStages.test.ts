import { describe, expect, it } from "vitest";
import { LOGISTIC_REGRESSION_DASHBOARD_STAGES } from "./dashboardStages.ts";
import { LOGISTIC_REGRESSION_CORE_STAGES } from "./stages.ts";

describe("logistic-regression dashboard stages", () => {
  it("stays in sync with the full lesson stage definitions", () => {
    expect(LOGISTIC_REGRESSION_DASHBOARD_STAGES).toEqual(
      LOGISTIC_REGRESSION_CORE_STAGES.map(({ index, title, englishTitle }) => ({
        index,
        title,
        englishTitle,
      })),
    );
  });
});
