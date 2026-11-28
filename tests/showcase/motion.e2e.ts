import { expect, test } from "@playwright/test";

test("featured deck keeps its selection, keyboard focus and layout on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/");
    const tabs = page.getByRole("radiogroup", { name: "切换实验示意" });
    const first = tabs.getByRole("radio", { name: "实现ALU" });
    await first.focus();
    await first.press("ArrowRight");
    const sampling = tabs.getByRole("radio", { name: "空间采样" });
    await expect(sampling).toBeFocused();
    await expect(sampling).toBeChecked();
    await expect(page.getByRole("figure")).toHaveCount(1);
    await expect(page.getByRole("figure")).toContainText("空间采样");
    await expect(page.locator(".featured-lab-description")).toContainText("低带宽接收端");
    await tabs.getByRole("radio", { name: "逻辑回归" }).click();
    await expect(page.getByRole("figure")).toContainText("逻辑回归");
    await expect(page.getByRole("link", { name: "进入实验", exact: true })).toHaveCount(7);
    expect(
      await page.locator(".page-layout-content").evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("circuit feedback follows changes without delaying the value or removing the wire", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/labs/calculator");
  await page
    .getByRole("button", { name: "A 输出 out", exact: true })
    .click({ position: { x: 13, y: 8 } });
  await page.getByRole("button", { name: "Y 输入 in", exact: true }).click();
  const wire = page.locator(".wires .wire");
  await expect(wire).toHaveCount(1);
  await expect(wire).toHaveClass(/is-low/);
  await page.getByRole("button", { name: "切换 A，当前 0", exact: true }).click();
  await expect(wire).toHaveClass(/is-high/);
  await expect
    .poll(() => page.locator(".wire-signal").evaluate((el) => el.getAnimations().length))
    .toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "切换 A，当前 1", exact: true }).click();
  await expect(wire).toHaveClass(/is-low/);
  await expect
    .poll(() => page.locator(".wire-signal").evaluate((el) => el.getAnimations().length))
    .toBe(0);
});

test("reduced motion leaves the deck, catalog and changed sampling result visible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("radio", { name: "空间采样" }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".featured-lab-card")
        .evaluateAll(
          (cards) =>
            cards
              .flatMap((card) => card.getAnimations())
              .filter((animation) =>
                (animation.effect as KeyframeEffect | null)
                  ?.getKeyframes()
                  .some((frame) => "transform" in frame),
              ).length,
        ),
    )
    .toBe(0);
  expect(
    await page.locator(".featured-lab-description").evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  await page.getByRole("link", { name: "进入实验", exact: true }).last().focus();
  await expect(page.locator(".home-catalog-reveal")).toHaveCSS("opacity", "1");
  await page.goto("/labs/image-sampling");
  const width = page.getByRole("spinbutton", { name: "正方形边长 n" });
  await width.fill("16");
  await expect(width).toHaveValue("16");
  await expect(page.locator(".sampling-result figcaption")).toContainText("接收端所见 16×");
  await expect(page.locator(".sampling-result")).toHaveCSS("opacity", "1");
  expect(await page.locator(".sampling-result").evaluate((el) => el.getAnimations().length)).toBe(
    0,
  );
});

test("sampling feedback keeps the focused cell inspector and updates only the result", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/labs/image-sampling");
  const size = page.getByRole("spinbutton", { name: "正方形边长 n" });
  await size.fill("12");
  await expect(size).toBeFocused();
  const grid = page.getByRole("button", { name: "接收端看到的 12×12 格子图", exact: true });
  await expect(grid).toBeVisible();
  await grid.focus();
  await grid.press("ArrowRight");
  await expect(grid).toBeFocused();
  await expect(page.locator(".cell-inspector")).toContainText("格子");
  await expect
    .poll(() => page.locator(".sampling-result").evaluate((el) => el.getAnimations().length))
    .toBe(0);
});

test("loss history stays accurate while feedback and keyboard epoch selection run", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Resume an existing learner at training; no backend or hidden test data is involved.
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
  await point.focus();
  await point.press("Enter");
  await expect(point).toHaveAttribute("aria-pressed", "true");
  await expect(point).toBeFocused();
  await expect(page.getByRole("slider", { name: "回放轮次" })).toHaveValue("1");
  const series = page.locator(".logistic-regression-loss-series");
  const before = await series.locator("polyline").first().getAttribute("points");
  await page
    .getByRole("radiogroup", { name: "学习率预设" })
    .getByRole("radio", { name: /较大/ })
    .click();
  await expect(series.locator("polyline").first()).not.toHaveAttribute("points", before!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await point.focus();
  await point.press("Space");
  await expect(point).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => series.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect
    .poll(() =>
      page.locator(".logistic-regression-epoch-cursor").evaluate((el) => el.getAnimations().length),
    )
    .toBe(0);
});
