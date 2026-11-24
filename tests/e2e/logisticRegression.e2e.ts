import { expect, test, type Page } from "@playwright/test";
import {
  LOGISTIC_REGRESSION_STAGES,
  TOKENIZE_PUZZLE_ITEMS,
} from "../../src/features/logistic-regression/domain/stages.ts";

const CHOICE_LABEL: Record<string, string> = {
  kept: "记为 1",
  duplicate: "重复了，不再计数",
  filtered: "标点，不计入",
  oov: "词表中没有",
};

function collectFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (new URL(url, "http://localhost").pathname.startsWith("/api/")) return;
    failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

async function expectTokenizeLayoutToFit(page: Page) {
  const originalViewport = page.viewportSize();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const task = page.locator(".lab-stage-task");
    await expect(task.getByRole("heading", { name: "本关任务", level: 2 })).toBeVisible();
    await expect(task).toContainText(LOGISTIC_REGRESSION_STAGES[1].task);
    expect(
      await task.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        return (
          bounds.left >= 0 && bounds.right <= window.innerWidth && el.scrollWidth <= el.clientWidth
        );
      }),
      `task overflows at ${width}px`,
    ).toBe(true);
    const overflowing = await page.locator(".logistic-regression-puzzle-list").evaluate((list) => {
      const bounds = list.getBoundingClientRect();
      return Array.from(
        list.querySelectorAll<HTMLElement>(
          ".logistic-regression-puzzle-row, .logistic-regression-pill-choice",
        ),
      )
        .filter((element) => {
          const itemBounds = element.getBoundingClientRect();
          return (
            itemBounds.left < bounds.left - 1 ||
            itemBounds.right > bounds.right + 1 ||
            element.scrollWidth > element.clientWidth + 1
          );
        })
        .map((element) => element.textContent?.trim());
    });
    expect(overflowing, `token choices overflow at ${width}px`).toEqual([]);
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
}

test("walks through all 5 stages of logistic-regression and tries the trained SMS classifier", async ({
  page,
  request,
}) => {
  test.setTimeout(45_000);
  const failures = collectFailures(page);

  const adminLogin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: "admin-dev-password" },
  });
  expect(adminLogin.status()).toBe(200);

  const classesResponse = await request.get("/api/admin/classes");
  expect(classesResponse.status()).toBe(200);
  const { classes } = (await classesResponse.json()) as { classes: { id: string }[] };
  const classId = classes[0]?.id;
  expect(classId).toBeTruthy();

  const studentNo = `e2e-regression-${Date.now()}`;
  const studentPassword = "e2e-password";
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "Logistic Regression Full Journey Student",
      password: studentPassword,
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill(studentNo);
  await page.getByLabel("密码").fill(studentPassword);
  const loginResp = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/auth/login"),
  );
  await page.getByRole("button", { name: "登录" }).click();
  expect((await loginResp).status()).toBe(200);
  await page.waitForURL("**/");

  await page.goto("labs/logistic-regression", { waitUntil: "networkidle" });
  await expect(page.getByRole("main", { name: "逻辑回归实验区" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /从短信到数字/ })).toBeDisabled();

  const prizeStrongSpam = page
    .getByRole("group", { name: "中奖 倾向设置" })
    .getByRole("button", { name: "+2 强垃圾" });
  const strategyResults = page.getByRole("list", { name: "6 条短信的分类结果" });
  await expect(strategyResults.getByRole("listitem")).toHaveCount(6);
  await expect(strategyResults.getByRole("button")).toHaveCount(0);
  const firstResult = strategyResults.getByRole("listitem").first();
  await expect(firstResult.getByText("漏拦")).toBeVisible();
  const s1DraftSave = page.waitForResponse((res) => {
    if (
      res.request().method() !== "PUT" ||
      !res.url().endsWith("/labs/logistic-regression/draft")
    ) {
      return false;
    }
    const body = res.request().postDataJSON() as {
      stageIndex?: number;
      draft?: { weights?: Record<string, number> };
    } | null;
    return body?.stageIndex === 1 && body.draft?.weights?.["中奖"] === 2;
  });
  await prizeStrongSpam.click();
  await expect(prizeStrongSpam).toHaveAttribute("aria-pressed", "true");
  await expect(firstResult.getByText("正确拦截")).toBeVisible();
  await expect(firstResult.locator(".katex-html")).toHaveText(/w⋅x=\+2/);
  const s1SaveRes = await s1DraftSave;
  expect(s1SaveRes.status()).toBe(200);
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分", exact: true }),
  ).toBeVisible();
  await expect(prizeStrongSpam).toHaveAttribute("aria-pressed", "true");

  const s1Tiers: Record<string, string> = {
    发票: "+1 偏垃圾",
    退款: "+1 偏垃圾",
    优惠: "+1 偏垃圾",
    妈妈: "−2 强正常",
    开会: "−1 偏正常",
    老师: "−1 偏正常",
  };
  for (const [word, tierLabel] of Object.entries(s1Tiers)) {
    await page
      .getByRole("group", { name: `${word} 倾向设置` })
      .getByRole("button", { name: tierLabel })
      .click();
  }
  await expect(page.getByText("判对 6 / 6")).toBeVisible();
  for (const prompt of LOGISTIC_REGRESSION_STAGES[0].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s1RespPromise = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().endsWith("/labs/logistic-regression/judge"),
  );
  await page.getByRole("button", { name: "提交第 1 关判定" }).click();
  expect((await s1RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 从短信到数字", exact: true }),
  ).toBeVisible();

  const hints = page.locator(".stage-brief details.hint-disclosure");
  const firstHint = hints.first();
  const trigger = firstHint.locator("summary");
  await expect(trigger).toHaveText("提示");
  await trigger.click();
  await expect(firstHint.getByText(LOGISTIC_REGRESSION_STAGES[1].hints[0])).toBeVisible();
  await expect(hints.nth(1)).not.toHaveAttribute("open", "");
  await trigger.press("Enter");
  await expect(firstHint).not.toHaveAttribute("open", "");
  await expectTokenizeLayoutToFit(page);
  let freeSeen = 0;
  for (const item of TOKENIZE_PUZZLE_ITEMS) {
    const label = `片段 ${item.text} 的处理方式`;
    const group =
      item.text === "免费"
        ? page.getByRole("group", { name: label }).nth(freeSeen++)
        : page.getByRole("group", { name: label });
    await group.getByRole("button", { name: CHOICE_LABEL[item.expected], exact: true }).click();
  }
  for (const prompt of LOGISTIC_REGRESSION_STAGES[1].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s2RespPromise = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().endsWith("/labs/logistic-regression/judge"),
  );
  await page.getByRole("button", { name: "提交第 2 关判定" }).click();
  expect((await s2RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 从分数到概率", exact: true }),
  ).toBeVisible();

  const draftSavePromise = page.waitForResponse((res) => {
    if (
      res.request().method() !== "PUT" ||
      !res.url().endsWith("/labs/logistic-regression/draft")
    ) {
      return false;
    }
    const body = res.request().postDataJSON() as {
      stageIndex?: number;
      draft?: { weights?: Record<string, number> };
    } | null;
    return body?.stageIndex === 3 && body.draft?.weights?.["免费"] === 2.2;
  });
  await page.locator("#logistic-regression-w-免费").fill("2.2");
  await expect(page.locator("#logistic-regression-w-免费")).toHaveValue("2.2");
  const draftSaveRes = await draftSavePromise;
  expect(draftSaveRes.status()).toBe(200);
  expect((await draftSaveRes.json()) as { applied?: boolean }).toMatchObject({ applied: true });
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 从分数到概率", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#logistic-regression-w-免费")).toHaveValue("2.2");

  await page.locator("#logistic-regression-bias-slider").fill("-1");
  const s3Weights: Record<string, string> = {
    免费: "2.2",
    领取: "2",
    点击: "2",
    退订: "2",
    优惠: "2",
    同学: "-2",
    明天: "-1.6",
    一起: "-1.6",
  };
  for (const [word, val] of Object.entries(s3Weights)) {
    await page.locator(`#logistic-regression-w-${word}`).fill(val);
  }
  await expect(page.getByText("分对 6 / 6")).toBeVisible();
  for (const prompt of LOGISTIC_REGRESSION_STAGES[2].prompts) {
    const label = prompt.options[prompt.correct].label.split("$")[0].trim();
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  const s3RespPromise = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().endsWith("/labs/logistic-regression/judge"),
  );
  await page.getByRole("button", { name: "提交第 3 关判定" }).click();
  expect((await s3RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 训练模型", exact: true }),
  ).toBeVisible();

  const beforeAfter = page.getByLabel("训练前后验证短信表现对比");
  await expect(beforeAfter).toBeVisible();
  await expect(beforeAfter.getByText(/训练前（全 0 权重各猜 50%）/)).toBeVisible();
  await expect(beforeAfter.getByText(/多数类 \/ 先验基线（不学词 · 按训练集估计）/)).toBeVisible();
  await expect(beforeAfter.getByText(/按训练集垃圾占比/)).toBeVisible();
  await expect(beforeAfter.getByText(/BCE Loss 0\.6931 →/)).toBeVisible();
  await expect(
    page.locator(".logistic-regression-formula-conclusion .katex-html").first(),
  ).toBeVisible();
  await expect(page.getByLabel("预测概率与损失")).toBeVisible();
  const appendixToggle = page.getByRole("button", { name: "数学推导", exact: true });
  await expect(appendixToggle).toHaveAttribute("aria-expanded", "false");
  await appendixToggle.click();
  await expect(page.getByRole("button", { name: "收起数学推导", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const advancedToggle = page.getByRole("button", { name: /进阶探索：单维权重切片图/ });
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "false");
  await advancedToggle.click();
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");

  const slicePanel = page.getByRole("region", { name: "单维权重与损失切片探索" });
  await slicePanel.getByRole("button", { name: /往右试推一格/ }).click();
  await slicePanel.getByRole("button", { name: /← 往左试推一格/ }).click();
  await expect(slicePanel.getByText(/没有回到原位/)).toBeVisible();

  const stage4Viewport = page.viewportSize();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const appendix = page.locator(".logistic-regression-appendix-grid");
    await expect(appendix.locator(".katex-error")).toHaveCount(0);
    await expect(appendix.locator("math[display=block]")).toHaveCount(6);
    expect(
      await appendix.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth + 1 &&
          el.getBoundingClientRect().right <= innerWidth + 1,
      ),
    ).toBe(true);
    const baselineOverflow = await beforeAfter.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.right > window.innerWidth + 1 || el.scrollWidth > el.clientWidth + 1;
    });
    expect(baselineOverflow, `Stage 4 baseline strip overflows at ${width}px`).toBe(false);
    const overflow = await slicePanel.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return (
        box.right > window.innerWidth + 1 ||
        el.scrollWidth > el.clientWidth + 1 ||
        Array.from(
          el.querySelectorAll<HTMLElement>(
            ".logistic-regression-svg-chart, .logistic-regression-trail-chips",
          ),
        ).some((child) => child.getBoundingClientRect().right > window.innerWidth + 1)
      );
    });
    expect(overflow, `Stage 4 slice panel overflows at ${width}px`).toBe(false);
  }
  if (stage4Viewport) await page.setViewportSize(stage4Viewport);

  await page.getByRole("button", { name: "适中 η = 0.1" }).click();
  const s4RespPromise = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().endsWith("/labs/logistic-regression/judge"),
  );
  await page.getByRole("button", { name: "提交第 4 关判定" }).click();
  expect((await s4RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 用新短信试试模型", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/学习率 0.1 · 12 轮 · 系统阈值/)).toBeVisible();
  await expect(page.getByText("概念检查", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "完成体验" })).toBeDisabled();
  const experienceDrafts: unknown[] = [];
  page.on("request", (req) => {
    if (req.method() === "PUT" && req.url().endsWith("/labs/logistic-regression/draft")) {
      const body = req.postDataJSON();
      if (body.stageIndex === 5) experienceDrafts.push(body);
    }
  });
  await page.clock.install();
  const smsInput = page.getByLabel("短信内容");
  await smsInput.fill("自写测试短信只留在页面");
  await expect(page.getByText(/^模型分类：/)).toBeVisible();
  await page.clock.fastForward(2_000);
  expect(experienceDrafts).toEqual([]);
  await expect(page.getByRole("button", { name: "完成体验" })).toBeDisabled();
  const labApi = `/api/classes/${classId}/labs/logistic-regression`;
  const project = await (await page.request.get(`${labApi}/project`)).json();
  const blockedDraft = await page.request.put(`${labApi}/draft`, {
    data: {
      stageIndex: 5,
      expectedGeneration: project.projectGeneration,
      expectedRevision: 0,
      draft: { probeText: "自写测试短信只留在页面" },
    },
  });
  expect(blockedDraft.status()).toBe(400);
  const markerOnly = await page.request.post(`${labApi}/judge`, {
    data: {
      stageIndex: 5,
      expectedGeneration: project.projectGeneration,
      draft: { activity: "sms-classification" },
    },
  });
  expect(markerOnly.status()).toBe(400);
  expect((await (await page.request.get(`${labApi}/project`)).json()).drafts).not.toHaveProperty(
    "5",
  );
  await page.getByRole("button", { name: "促销短信", exact: true }).click();
  await expect(page.getByText("模型分类：垃圾短信")).toBeVisible();
  await page.getByRole("button", { name: "日常消息", exact: true }).click();
  await expect(page.getByText("模型分类：正常短信")).toBeVisible();
  await page.getByText("查看哪些词影响了分类").click();
  await expect(page.getByLabel("Sigmoid 概率曲线")).toBeVisible();
  const experience = page.getByRole("region", { name: "短信分类体验" });
  const experienceViewport = page.viewportSize();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await experience.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth + 1 &&
        element.getBoundingClientRect().right <= window.innerWidth + 1,
    );
    expect(fits, `SMS experience overflows at ${width}px`).toBe(true);
  }
  if (experienceViewport) await page.setViewportSize(experienceViewport);
  const completion = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().endsWith("/labs/logistic-regression/judge"),
  );
  await page.getByRole("button", { name: "完成体验" }).click();
  const completionResponse = await completion;
  expect(completionResponse.request().postDataJSON().draft).toEqual({
    activity: "sms-classification",
    exampleId: "everyday",
    prediction: 0,
  });
  expect(await completionResponse.json()).toMatchObject({ passedStages: [1, 2, 3, 4, 5] });
  await expect(page.getByText("已完成短信分类体验")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 用新短信试试模型", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/学习率 0.1 · 12 轮 · 系统阈值/)).toBeVisible();
  await expect(page.getByText("已完成短信分类体验")).toBeVisible();

  await expect(smsInput).toHaveValue("");
  await page.getByRole("button", { name: /从短信到数字/ }).click();
  await page.getByRole("button", { name: "重置进度" }).click();
  const resetDialog = page.getByRole("dialog", { name: "重置实验进度" });
  await expect(resetDialog.getByRole("radio", { name: /从本关重来/ })).toBeChecked();
  const partialReset = page.waitForResponse((res) =>
    res.url().endsWith("/logistic-regression/reset"),
  );
  await resetDialog.getByRole("button", { name: "确认重置" }).click();
  expect(await (await partialReset).json()).toMatchObject({ currentStage: 2, passedStages: [1] });
  await expect(resetDialog).not.toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 从短信到数字", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /从分数到概率/ })).toBeDisabled();

  await page.getByRole("button", { name: "重置进度" }).click();
  await resetDialog.getByRole("radio", { name: /重置整个实验/ }).check();
  const fullReset = page.waitForResponse((res) => res.url().endsWith("/logistic-regression/reset"));
  await resetDialog.getByRole("button", { name: "确认重置" }).click();
  expect(await (await fullReset).json()).toMatchObject({
    currentStage: 1,
    passedStages: [],
    drafts: {},
  });
  await page.goto(`classes/${classId}/labs/logistic-regression?classroom=1&stage=4`, {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分", exact: true }),
  ).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});

test("lists logistic-regression in admin/teacher lab management and renders its matrix & drawer in class dashboard", async ({
  page,
  request,
}) => {
  const failures = collectFailures(page);

  const adminLogin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: "admin-dev-password" },
  });
  expect(adminLogin.status()).toBe(200);

  const classesRes = await request.get("/api/admin/classes");
  expect(classesRes.status()).toBe(200);
  const { classes } = (await classesRes.json()) as { classes: { id: string }[] };
  const classId = classes[0]?.id;
  expect(classId).toBeTruthy();

  const studentNo = `e2e-regression-${Date.now()}-d`;
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "Logistic Regression Dashboard Student",
      password: "e2e-password",
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  const studentLogin = await request.post("/api/auth/login", {
    data: { studentNo, password: "e2e-password" },
  });
  expect(studentLogin.status()).toBe(200);

  const judgeRes = await request.post(`/api/classes/${classId}/labs/logistic-regression/judge`, {
    data: { stageIndex: 1, expectedGeneration: 0, draft: {} },
  });
  expect(judgeRes.status()).toBe(200);
  const judgeBody = (await judgeRes.json()) as { score: number; total: number; passed: boolean };
  expect(judgeBody.passed).toBe(false);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("admin");
  await page.getByLabel("密码").fill("admin-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("admin/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "实验管理" })).toBeVisible();
  const logisticRegressionRow = page.getByRole("row", {
    name: /逻辑回归\s*logistic-regression\s*5/,
  });
  await expect(logisticRegressionRow).toBeVisible();

  await logisticRegressionRow.getByLabel("隐藏（仅管理员可见）").check();
  await logisticRegressionRow.getByRole("button", { name: "保存" }).click();
  await expect(logisticRegressionRow.getByText("已隐藏")).toBeVisible();
  await expect(logisticRegressionRow.getByRole("button", { name: "保存" })).toBeDisabled();

  await page.getByRole("button", { name: /管理员/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("teacher/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /逻辑回归/ })).toHaveCount(0);

  await page.goto(`classes/${classId}/labs/logistic-regression`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "这个实验暂未开放" })).toBeVisible();

  await page.getByRole("button", { name: /教师/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await page.getByRole("link", { name: "去登录" }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel("学号").fill("admin");
  await page.getByLabel("密码").fill("admin-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("admin/labs", { waitUntil: "networkidle" });
  await expect(logisticRegressionRow).toBeVisible();
  await logisticRegressionRow.getByLabel("开放").check();
  await logisticRegressionRow.getByRole("button", { name: "保存" }).click();
  await expect(logisticRegressionRow.getByText("全部班级")).toBeVisible();
  await expect(logisticRegressionRow.getByRole("button", { name: "保存" })).toBeDisabled();

  await page.getByRole("button", { name: /管理员/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("teacher/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /逻辑回归\s*logistic-regression\s*5/ })).toBeVisible();

  await page.goto(`classes/${classId}/dashboard?lab=ml-intro`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/dashboard\?lab=logistic-regression$/);
  await expect(page.getByRole("combobox", { name: "选择实验" })).toHaveValue("logistic-regression");
  for (const stage of LOGISTIC_REGRESSION_STAGES) {
    await expect(page.getByRole("columnheader", { name: stage.title })).toBeVisible();
  }

  const studentRow = page.getByRole("row", { name: new RegExp(studentNo) });
  const scoreButton = studentRow.getByRole("button", {
    name: `${judgeBody.score}/${judgeBody.total}`,
  });
  const detailDialog = page.getByRole("dialog", { name: "提交详情" });
  const matrix = page.getByLabel("学生进度横向滚动区");
  await matrix.focus();
  await page.keyboard.press("Tab");
  await expect(scoreButton).toBeFocused();
  await expect(scoreButton).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(detailDialog.locator("xpath=self::dialog")).toBeVisible();
  await expect(detailDialog.getByText("6 条示例短信分类")).toBeVisible();
  await expect(detailDialog.getByRole("button", { name: "关闭详情" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(detailDialog).toBeHidden();
  await expect(scoreButton).toBeFocused();

  await scoreButton.click();
  await expect(detailDialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(detailDialog).toBeHidden();
  await expect(scoreButton).toBeFocused();

  expect(failures, failures.join("\n")).toEqual([]);
});

test("teacher follows sequential unlocks and uses the shared reset dialog", async ({ page }) => {
  const failures = collectFailures(page);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "实验课程" })).toBeVisible();

  const logisticRegressionCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "逻辑回归" }) });
  await logisticRegressionCard.getByRole("link", { name: "开始实验" }).click();

  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "课堂模式：先看后面关卡" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /训练模型/ })).toBeDisabled();
  await page.getByRole("button", { name: "收起关卡栏" }).click();
  await expect(page.getByRole("button", { name: /训练模型/ })).not.toBeVisible();
  await page.getByRole("button", { name: "展开关卡栏" }).click();
  await expect(page.getByRole("button", { name: /训练模型/ })).toBeDisabled();

  await page.setViewportSize({ width: 390, height: 844 });
  const expandRail = page.getByRole("button", { name: "展开关卡栏" });
  await expect(expandRail).toHaveAttribute("aria-expanded", "false");
  await expect(expandRail).toHaveText("第 1 关");
  await expect(page.getByRole("button", { name: /训练模型/ })).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "逻辑回归 - 给 10 个词打分", exact: true }),
  ).toBeInViewport();
  await expandRail.click();
  await expect(page.getByRole("button", { name: /训练模型/ })).toBeDisabled();
  await page.getByRole("button", { name: "收起关卡栏" }).click();
  await page.getByRole("button", { name: "重置进度" }).click();
  const resetDialog = page.getByRole("dialog", { name: "重置实验进度" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole("radio", { name: /重置整个实验/ }).check();

  const resetResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().includes("/labs/logistic-regression/reset"),
  );
  await resetDialog.getByRole("button", { name: "确认重置" }).click();
  expect((await resetResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "给 10 个词打分" })).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "给 10 个词打分" })).toBeVisible();
  await expect(expandRail).toHaveAttribute("aria-expanded", "false");
  expect(failures, failures.join("\n")).toEqual([]);
});
