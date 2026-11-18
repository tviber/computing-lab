import { expect, test, type Page } from "@playwright/test";
import { ML_STAGES, TOKENIZE_PUZZLE_ITEMS } from "../../src/features/ml-intro/domain/stages.ts";

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

async function expectMessagePanelsToFit(page: Page) {
  const originalViewport = page.viewportSize();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflowing = await page.locator(".ml-case-grid").evaluate((grid) => {
      const gridBounds = grid.getBoundingClientRect();
      return Array.from(
        grid.querySelectorAll<HTMLElement>(
          ".ml-case-btn, .ml-case-text, .ml-probe-card, .ml-probe-text, .ml-waterfall-row, .ml-svg-chart",
        ),
      )
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.left < gridBounds.left - 1 ||
            bounds.right > gridBounds.right + 1 ||
            bounds.right > window.innerWidth + 1 ||
            element.scrollWidth > element.clientWidth + 1
          );
        })
        .map((element) => element.className);
    });
    expect(overflowing, `message panels overflow at ${width}px`).toEqual([]);
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function expectTokenChoicesToFit(page: Page) {
  const originalViewport = page.viewportSize();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflowing = await page.locator(".ml-puzzle-list").evaluate((list) => {
      const bounds = list.getBoundingClientRect();
      return Array.from(list.querySelectorAll<HTMLElement>(".ml-puzzle-row, .ml-pill-choice"))
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

test("walks through all 6 stages of ml-intro with persistence and sealed Stage 6 blind exam", async ({
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

  const studentNo = `e2e-ml-${Date.now()}`;
  const studentPassword = "e2e-password";
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "ML Full Journey Student",
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

  await page.goto("labs/ml-intro", { waitUntil: "networkidle" });
  await expect(page.getByRole("main", { name: "机器学习入门实验区" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "给 10 个词打分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /把短信变成数字/ })).toBeDisabled();

  // Stage 1: Set weights via numeric box + slider, verify autosave + reload restore, then pass
  const prizeStrongSpam = page
    .getByRole("group", { name: "中奖 倾向设置" })
    .getByRole("button", { name: "+2 强垃圾" });
  const s1DraftSave = page.waitForResponse((res) => {
    if (res.request().method() !== "PUT" || !res.url().endsWith("/labs/ml-intro/draft")) {
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
  const s1SaveRes = await s1DraftSave;
  expect(s1SaveRes.status()).toBe(200);
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "给 10 个词打分", exact: true })).toBeVisible();
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
  for (const prompt of ML_STAGES[0].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s1RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 1 关判定" }).click();
  expect((await s1RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(page.getByRole("heading", { name: "把短信变成数字", exact: true })).toBeVisible();

  // Stage 2: Tokenize + concepts
  await expectTokenChoicesToFit(page);
  let freeSeen = 0;
  for (const item of TOKENIZE_PUZZLE_ITEMS) {
    const label = `片段 ${item.text} 的处理方式`;
    const group =
      item.text === "免费"
        ? page.getByRole("group", { name: label }).nth(freeSeen++)
        : page.getByRole("group", { name: label });
    await group.getByRole("button", { name: CHOICE_LABEL[item.expected], exact: true }).click();
  }
  for (const prompt of ML_STAGES[1].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s2RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 2 关判定" }).click();
  expect((await s2RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(page.getByRole("heading", { name: "把分数换成概率", exact: true })).toBeVisible();

  // Stage 3: Edit manual weights on 6 calibration messages, wait for PUT /draft, reload, then judge
  const draftSavePromise = page.waitForResponse((res) => {
    if (res.request().method() !== "PUT" || !res.url().endsWith("/labs/ml-intro/draft")) {
      return false;
    }
    const body = res.request().postDataJSON() as {
      stageIndex?: number;
      draft?: { weights?: Record<string, number> };
    } | null;
    return body?.stageIndex === 3 && body.draft?.weights?.["免费"] === 2.2;
  });
  await page.locator("#ml-w-免费").fill("2.2");
  await expect(page.locator("#ml-w-免费")).toHaveValue("2.2");
  const draftSaveRes = await draftSavePromise;
  expect(draftSaveRes.status()).toBe(200);
  expect((await draftSaveRes.json()) as { applied?: boolean }).toMatchObject({ applied: true });
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "把分数换成概率", exact: true })).toBeVisible();
  await expect(page.locator("#ml-w-免费")).toHaveValue("2.2");

  await page.locator("#ml-bias-slider").fill("-1");
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
    await page.locator(`#ml-w-${word}`).fill(val);
  }
  await expect(page.getByText("分对 6 / 6")).toBeVisible();
  for (const prompt of ML_STAGES[2].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s3RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 3 关判定" }).click();
  expect((await s3RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(page.getByRole("heading", { name: "让模型调整权重", exact: true })).toBeVisible();

  // Stage 4: Training before/after comparison first, role visuals, appendix toggle, collapsible advanced 1D slice
  await expect(page.getByText(/训练前后效果对比/)).toBeVisible();
  await expect(page.getByText(/损失（Loss）= 猜错扣分表/)).toBeVisible();
  await expect(page.getByLabel("预测概率与猜错扣分曲线")).toBeVisible();
  const appendixToggle = page.getByRole("button", { name: /数学推导/ });
  await expect(appendixToggle).toHaveAttribute("aria-expanded", "false");
  await appendixToggle.click();
  await expect(appendixToggle).toHaveAttribute("aria-expanded", "true");

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
    const overflow = await slicePanel.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return (
        box.right > window.innerWidth + 1 ||
        el.scrollWidth > el.clientWidth + 1 ||
        Array.from(el.querySelectorAll<HTMLElement>(".ml-svg-chart, .ml-trail-chips")).some(
          (child) => child.getBoundingClientRect().right > window.innerWidth + 1,
        )
      );
    });
    expect(overflow, `Stage 4 slice panel overflows at ${width}px`).toBe(false);
  }
  if (stage4Viewport) await page.setViewportSize(stage4Viewport);

  await page.getByRole("button", { name: "适中 η = 0.1" }).click();
  for (const prompt of ML_STAGES[3].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s4RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 4 关判定" }).click();
  expect((await s4RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(
    page.getByRole("heading", { name: "检查模型分错了什么", exact: true }),
  ).toBeVisible();

  // Stage 5: Restore balanced threshold + verify UI explanation parity + concepts
  await page.getByRole("button", { name: "恢复推荐初值" }).click();
  const firstCaseBtn = page.locator(".ml-case-btn").first();
  await expect(firstCaseBtn).toBeVisible();
  const listProb = (await firstCaseBtn.locator(".ml-case-prob").textContent())?.trim() ?? "";
  expect(listProb).toMatch(/^\d+\.\d%$/);
  await expect(page.getByText(new RegExp(`模型判定：.*（${listProb}）`))).toBeVisible();
  await expectMessagePanelsToFit(page);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: /FN · 漏掉垃圾短信/ }).click();
  const selectedFalseNegative = page.locator(".ml-case-btn").first();
  await selectedFalseNegative.click();
  await expect(page.getByRole("region", { name: "所选短信的评分依据" })).toBeInViewport();
  await expect(page.getByText("模型的评分依据", { exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "返回短信列表" }).click();
  await expect(selectedFalseNegative).toBeFocused();
  await expect(selectedFalseNegative).toBeInViewport();
  if (originalViewport) await page.setViewportSize(originalViewport);

  for (const prompt of ML_STAGES[4].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s5RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 5 关判定" }).click();
  expect((await s5RespPromise).status()).toBe(200);
  await expect(page.getByText("通过本关判定")).toBeVisible();
  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(page.getByRole("heading", { name: "用新短信检验模型", exact: true })).toBeVisible();

  // Stage 6: Full training sample preset + sealed blind exam
  await page.getByRole("button", { name: "150 条（小样本）", exact: true }).click();
  await page.getByRole("button", { name: "记录当前结果作对照" }).click();
  await page.getByRole("button", { name: "1,400 条（全部训练短信）" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "本次只改变了：训练样本量" }),
  ).toBeVisible();
  const sampleComparison = page.getByRole("table", { name: "已记录与当前的公开实验结果" });
  await expect(sampleComparison.getByRole("row", { name: /训练样本量/ })).toContainText("150 条");
  await expect(sampleComparison.getByRole("row", { name: /训练样本量/ })).toContainText("1,400 条");
  for (const prompt of ML_STAGES[5].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s6RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交到测试集检查" }).click();
  const s6Resp = await s6RespPromise;
  expect(s6Resp.status()).toBe(200);
  const s6BodyText = await s6Resp.text();
  expect(s6BodyText).not.toContain("test-accuracy");
  expect(s6BodyText).not.toContain("瑞金北村小学");

  await expect(page.getByText("通过本关判定")).toBeVisible();
  await expect(page.getByText("300 条未公开短信测试", { exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});

test("lists ml-intro in admin/teacher lab management and renders its matrix & drawer in class dashboard", async ({
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

  const studentNo = `e2e-mldash-${Date.now()}`;
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "ML Dashboard Student",
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

  const judgeRes = await request.post(`/api/classes/${classId}/labs/ml-intro/judge`, {
    data: { stageIndex: 1, draft: {} },
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
  const mlRow = page.getByRole("row", { name: /机器学习入门\s*ml-intro\s*6/ });
  await expect(mlRow).toBeVisible();

  await mlRow.getByLabel("隐藏（仅管理员可见）").check();
  await mlRow.getByRole("button", { name: "保存" }).click();
  await expect(mlRow.getByText("已隐藏")).toBeVisible();
  await expect(mlRow.getByRole("button", { name: "保存" })).toBeDisabled();

  await page.getByRole("button", { name: /管理员/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("teacher/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /机器学习入门/ })).toHaveCount(0);

  await page.goto(`classes/${classId}/labs/ml-intro`, { waitUntil: "networkidle" });
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
  await expect(mlRow).toBeVisible();
  await mlRow.getByLabel("开放").check();
  await mlRow.getByRole("button", { name: "保存" }).click();
  await expect(mlRow.getByText("全部班级")).toBeVisible();
  await expect(mlRow.getByRole("button", { name: "保存" })).toBeDisabled();

  await page.getByRole("button", { name: /管理员/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("teacher/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /机器学习入门\s*ml-intro\s*6/ })).toBeVisible();

  await page.goto(`classes/${classId}/dashboard?lab=ml-intro`, { waitUntil: "networkidle" });
  await expect(page.getByRole("combobox", { name: "选择实验" })).toHaveValue("ml-intro");
  for (const stage of ML_STAGES) {
    await expect(
      page.getByRole("columnheader", { name: stage.englishTitle ?? stage.title }),
    ).toBeVisible();
  }

  const studentRow = page.getByRole("row", { name: new RegExp(studentNo) });
  await studentRow.getByRole("button", { name: `${judgeBody.score}/${judgeBody.total}` }).click();
  await expect(page.getByRole("dialog", { name: "提交详情" })).toBeVisible();
  await expect(page.getByText("6 条示例短信分类")).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
