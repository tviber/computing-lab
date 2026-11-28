import { describe, expect, it } from "vitest";
import {
  BUNDLE_BUDGETS,
  CLASSROOM_ENTRY_GZIP_BYTES,
  budgetsForDist,
  collectStaticClosure,
  evaluateBundleReport,
  findEntryKey,
  findRouteKeys,
} from "./check-bundle-budget.mjs";

describe("bundle budget checks", () => {
  it("uses the classroom entry budget only for classroom output", () => {
    expect(budgetsForDist("dist").entryGzipBytes).toBe(BUNDLE_BUDGETS.entryGzipBytes);
    expect(budgetsForDist("dist-classroom").entryGzipBytes).toBe(CLASSROOM_ENTRY_GZIP_BYTES);
  });

  it("records an entry budget failure with an artificially small limit", () => {
    const report = {
      entry: { gzip: 2, raw: 3, files: ["assets/index.js"] },
      routes: [],
      assets: [],
      missingRouteBudgets: [],
      missingAssets: [],
      vendor: { bytes: 1, files: 1 },
    };
    const budgets = {
      ...BUNDLE_BUDGETS,
      entryGzipBytes: 1,
      routeGzipBytes: {},
      assetGzipBytes: {},
    };
    expect(evaluateBundleReport(report, budgets)).toContain("entry JS: 2 B gzip > 1 B budget");
  });

  it("finds the Vite entry and all seven lab route keys", () => {
    const manifest = {
      "index.html": { file: "assets/index.js", isEntry: true },
      ...Object.fromEntries(
        [
          ["calculator", "CalculatorLabPage"],
          ["color-quantization", "ColorQuantizationLabPage"],
          ["decoding", "DecodingLabPage"],
          ["image-sampling", "ImageSamplingLabPage"],
          ["logistic-regression", "LogisticRegressionLabPage"],
          ["lunch-shift", "LunchShiftLabPage"],
          ["stats-foundations", "StatsFoundationsLabPage"],
        ].map(([labId, component]) => [
          `src/features/${labId}/ui/${component}.tsx`,
          { file: `assets/${labId}.js`, isDynamicEntry: true },
        ]),
      ),
    };
    expect(findEntryKey(manifest)).toBe("index.html");
    expect([...findRouteKeys(manifest).keys()]).toHaveLength(7);
    expect(
      collectStaticClosure(manifest, "src/features/calculator/ui/CalculatorLabPage.tsx"),
    ).toEqual(new Set(["src/features/calculator/ui/CalculatorLabPage.tsx"]));
  });
});
