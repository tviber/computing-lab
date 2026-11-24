import { expect, test, type Locator } from "@playwright/test";

async function moveSlider(slider: Locator, value: number) {
  const step = Number(await slider.getAttribute("step"));
  const steps = Math.round((value - Number(await slider.inputValue())) / step);
  await slider.focus();
  for (let i = 0; i < Math.abs(steps); i++) {
    await slider.press(steps > 0 ? "ArrowRight" : "ArrowLeft");
  }
  await expect(slider).toHaveValue(String(value));
}

test("a student resumes a saved fit, completes four stages and opens logistic regression", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const admin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password" },
  });
  expect(admin.ok()).toBe(true);
  const { classes } = await (await request.get("/api/admin/classes")).json();
  const credentials = { studentNo: `stats-${Date.now()}`, password: "stats-classroom" };
  const student = await request.post("/api/admin/users", {
    data: { ...credentials, name: "统计实验学生", role: "user", classId: classes[0].id },
  });
  expect(student.status()).toBe(201);
  expect((await page.request.post("/api/auth/login", { data: credentials })).ok()).toBe(true);
  await page.goto(".");
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "统计基础", exact: true }) })
    .getByRole("link")
    .click();
  const submit = page.getByRole("button", { name: "提交检查本关" });
  await expect(page.getByRole("heading", { name: "本关任务" })).toBeVisible();
  await expect(page.getByRole("button", { name: /条件概率：校园气象台/ })).toBeDisabled();
  await submit.click();
  await expect(page.locator(".sf-feedback.is-fail")).toBeVisible();
  const dashboard = `/api/classes/${classes[0].id}/dashboard`;
  const matrix = await (await request.get(`${dashboard}?lab=stats-foundations`)).json();
  const row = matrix.rows.find(
    (student: { studentNo: string }) => student.studentNo === credentials.studentNo,
  );
  const submission = await (
    await request.get(`${dashboard}/submissions/${row.cells[1].submissionId}`)
  ).json();
  expect(submission.testSummary.parts[0]).toMatchObject({
    ok: false,
    detail: expect.stringContaining("MSE"),
  });

  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  await expect(otherTab.getByRole("slider", { name: /斜率 w/ })).toBeVisible();
  const slope = page.getByRole("slider", { name: /斜率 w/ });
  await moveSlider(slope, 3.2);
  await moveSlider(page.getByRole("slider", { name: /截距 b/ }), -22);
  await page.getByRole("radio", { name: /正误差和负误差/ }).check();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  // This tab still holds revision zero. Its edit must survive the refused write.
  const otherSlope = otherTab.getByRole("slider", { name: /斜率 w/ });
  await moveSlider(otherSlope, 2.9);
  await expect(otherTab.getByText("已载入最新进度", { exact: false })).toBeVisible();
  await expect(otherSlope).toHaveValue("3.2");
  await otherTab.getByRole("button", { name: "找回我未保存的修改" }).click();
  await expect(otherSlope).toHaveValue("2.9");
  await expect(otherTab.getByText("已保存", { exact: true })).toBeVisible();
  await otherTab.close();
  await page.reload();
  await expect(slope).toHaveValue("2.9");
  await moveSlider(slope, 3.2);
  await moveSlider(page.getByRole("slider", { name: /截距 b/ }), -22);
  await page.getByRole("radio", { name: /正误差和负误差/ }).check();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(slope).toHaveValue("3.2");
  await expect(page.getByRole("radio", { name: /正误差和负误差/ })).toBeChecked();
  await submit.click();
  await page.getByRole("button", { name: /进入第 2 关/ }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /只看预报下雨/ }).click();
  await expect(page.locator(".sf-filter-summary")).toContainText("40 天");
  await expect(page.getByRole("table", { name: /预报与实际天气/ })).toBeVisible();
  expect(
    await page.locator(".page-layout-content").evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("textbox", { name: "P(真下雨) 百分比", exact: true }).fill("30");
  await page.getByRole("textbox", { name: "P(真下雨 | 预报下雨) 百分比" }).fill("60");
  await page.getByRole("textbox", { name: "P(预报下雨 | 真下雨) 百分比" }).fill("80");
  await page.getByRole("radio", { name: /已知条件不同/ }).check();
  await submit.click();
  await page.getByRole("button", { name: /进入第 3 关/ }).click();
  await page.getByRole("button", { name: "负对数似然 −ln L(p)" }).click();
  const coin = page.getByRole("slider", { name: "正面朝上的概率 p" });
  await coin.press("Home");
  await expect(page.locator(".sf-metric-value").nth(1)).toHaveText("6.698 × 10-10");
  await moveSlider(coin, 0.73);
  await page.getByRole("radio", { name: /连乘|相乘变成加法/ }).check();
  await submit.click();
  await page.getByRole("button", { name: /进入第 4 关/ }).click();
  await moveSlider(slope, 1.8);
  await moveSlider(page.getByRole("slider", { name: /偏移 b/ }), -8);
  await page.getByRole("button", { name: "用直线硬拟合" }).click();
  await submit.click();
  await expect(page.locator(".sf-feedback.is-fail")).toContainText("切换到 Sigmoid");
  let releaseDraft!: () => void;
  const heldDraft = new Promise<void>((resolve) => {
    releaseDraft = resolve;
  });
  await page.route("**/labs/stats-foundations/draft", async (route) => {
    await heldDraft;
    await route.continue();
  });
  await page.getByRole("button", { name: "Sigmoid 曲线" }).click();
  await submit.click();
  const nextLesson = page.getByRole("link", { name: /前往下一课/ });
  try {
    await expect(page.getByText("草稿保存后即可进入下一课。")).toBeVisible();
    await expect(nextLesson).toHaveCount(0);
  } finally {
    releaseDraft();
  }
  await nextLesson.click();
  const savedProject = await page.request.get(
    `/api/classes/${classes[0].id}/labs/stats-foundations/project`,
  );
  expect((await savedProject.json()).drafts[4]).toMatchObject({
    curveMode: "sigmoid",
    w: 1.8,
    b: -8,
  });
  await expect(page.getByRole("main", { name: "逻辑回归实验区" })).toBeVisible();
  expect(errors).toEqual([]);
});
