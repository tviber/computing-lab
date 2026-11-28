import { expect, test } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

test("coarse pointer keeps deck tabs and chart epochs tappable", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  const sampling = page.getByRole("radio", { name: "空间采样" });
  const tabBox = await sampling.boundingBox();
  expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await sampling.tap();
  await expect(page.getByRole("figure")).toContainText("空间采样");

  await page.addInitScript(() => {
    localStorage.setItem(
      "computing-lab:project:v1:logistic-regression",
      JSON.stringify({
        userId: "local-learner-v1",
        labId: "logistic-regression",
        currentStage: 4,
        passedStages: [1, 2, 3],
        drafts: {},
        draftRevisions: {},
        projectGeneration: 0,
        unlockedSubmodules: [],
        runSummaries: {},
      }),
    );
  });
  await page.goto("/labs/logistic-regression?stage=4");
  const point = page.getByRole("button", { name: /^查看第 1 轮，验证损失/ });
  await expect(point).toBeVisible();
  const hitArea = point.locator(".logistic-regression-epoch-hit-area");
  await point.scrollIntoViewIfNeeded();
  const box = await hitArea.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(await hitArea.evaluate((element) => getComputedStyle(element).strokeWidth)).toBe("44px");
  // Tap outside the small dot but inside its enlarged touch target.
  await page.touchscreen.tap(box!.x + box!.width * 0.3, box!.y + box!.height * 0.3);
  await expect(page.getByRole("slider", { name: "回放轮次" })).toHaveValue("1");
});
