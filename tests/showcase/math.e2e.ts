import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function openStage(page: Page, labId: string, stage: number) {
  // Seed before mounting the lab so its autosave cannot overwrite the fixture.
  await page.goto("/");
  await page.evaluate(
    ({ labId, stage }) => {
      localStorage.setItem(
        `computing-lab:project:v1:${labId}`,
        JSON.stringify({
          userId: "local-learner-v1",
          labId,
          currentStage: stage,
          passedStages: Array.from({ length: 11 }, (_, index) => index + 1),
          drafts: {},
          draftRevisions: {},
          projectGeneration: 0,
          unlockedSubmodules: [],
          runSummaries: {},
        }),
      );
    },
    { labId, stage },
  );
  // Optional stages (e.g. logistic regression 6) are selected explicitly;
  // currentStage alone resumes the lab's mainline stage.
  await page.goto(`/labs/${labId}?stage=${stage}`);
  await expect(page).toHaveURL(new RegExp(`/labs/${labId}\\?stage=${stage}$`));
  await expect(page).not.toHaveTitle("");
  await expect(page.getByRole("heading", { name: "本关任务", exact: true })).toBeVisible();
  await expect(page.locator("main math").first()).toBeAttached();
}

async function expectHealthyMath(page: Page) {
  await expect(page.locator(".katex-error, vite-error-overlay")).toHaveCount(0);
  expect(
    await page.locator("main").evaluate((main) => {
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const leftovers: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest(".math-formula, code, pre, textarea, .cm-editor")) continue;
        if (/\$[^$\n]+\$/.test(node.textContent ?? "")) leftovers.push(node.textContent!);
      }
      return leftovers;
    }),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("statistics math updates through sliders, answers, feedback and narrow layouts", async ({
  page,
}) => {
  const errors = watchErrors(page);
  for (const stage of [1, 2, 3, 4]) {
    await openStage(page, "stats-foundations", stage);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expectHealthyMath(page);
    }
    if (stage === 3) {
      const slider = page.getByRole("slider", { name: /正面朝上的概率/ });
      await slider.press("Home");
      for (let step = 0; step < 65; step++) await slider.press("ArrowRight");
      await expect(slider).toHaveValue("70");
      await expect(page.locator(".sf-formula-line annotation")).toHaveText(
        String.raw`L(0.7)=0.7^{7}\times0.3^{3}`,
      );
      await page.getByRole("radio", { name: /负对数似然/ }).click();
      await expect(page.getByRole("img", { name: "负对数似然曲线" })).toBeVisible();
      await page.getByRole("button", { name: /所有概率都会变成/ }).click();
      await expect(page.locator(".concept-checklist-note math")).toBeAttached();
      await page.getByRole("button", { name: /取对数能把/ }).click();
      await expect(page.locator(".concept-checklist-reveal math")).toHaveCount(2);
      await page.getByRole("button", { name: "提交检查本关" }).click();
      await expect(page.locator(".sf-feedback.is-pass math")).toBeAttached();
      await expectHealthyMath(page);
      await page.screenshot({ path: "/tmp/issue185-stats-mobile.png", fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: "/tmp/issue185-stats-desktop.png", fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test("other formula-heavy labs preserve data and render their teaching math", async ({ page }) => {
  const errors = watchErrors(page);
  for (const [labId, stages] of [
    ["logistic-regression", [3, 4, 6]],
    ["calculator", [2, 5, 6, 7]],
    ["decoding", [2, 3]],
    ["image-sampling", [1, 4]],
    ["color-quantization", [1]],
  ] as const) {
    for (const stage of stages) {
      await openStage(page, labId, stage);
      if (labId === "logistic-regression" && stage === 6) {
        await page.getByRole("radio", { name: "负数", exact: true }).click();
        await expect(page.locator(".sgd-step-result math")).not.toHaveCount(0);
        await page.getByRole("button", { name: "数学推导", exact: true }).click();
        await expect(page.locator("math[display=block]")).toHaveCount(6);
        await page.getByRole("button", { name: "按梯度更新一步", exact: true }).click();
        await expect(page.getByRole("list", { name: "跳跃历史轨迹" })).toBeVisible();
      }
      if (labId === "decoding" && stage === 2) {
        await page.getByRole("button", { name: "试读第一组" }).click();
        await expect(page.locator(".bit-group code").first()).toHaveText(/^[01]{8}$/);
      }
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expectHealthyMath(page);
      }
      if (labId === "logistic-regression" && stage === 6) {
        await page.screenshot({ path: "/tmp/issue185-logistic-mobile.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: "/tmp/issue185-logistic-desktop.png", fullPage: true });
      }
    }
  }
  expect(errors).toEqual([]);
});
