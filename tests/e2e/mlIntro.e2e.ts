import { expect, test, type Page } from "@playwright/test";
import { ML_STAGES, STAGE1_PUZZLE_ITEMS } from "../../src/features/ml-intro/domain/stages.ts";

const CHOICE_LABEL: Record<string, string> = {
  kept: "入表 (x=1)",
  duplicate: "重复忽略",
  filtered: "标点过滤",
  oov: "新词 OOV",
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

test("walks through all 5 stages of ml-intro with persistence and sealed Stage 5 blind exam", async ({
  page,
  request,
}) => {
  test.setTimeout(30_000);
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
  await expect(page.getByRole("heading", { name: "把短信变成数字" })).toBeVisible();
  await expect(page.getByRole("button", { name: /给词打分与概率/ })).toBeDisabled();

  // Stage 1: Tokenize + concepts
  let freeSeen = 0;
  for (const item of STAGE1_PUZZLE_ITEMS) {
    const label = `片段 ${item.text} 的归类`;
    const group =
      item.text === "免费"
        ? page.getByRole("group", { name: label }).nth(freeSeen++)
        : page.getByRole("group", { name: label });
    await group.getByRole("button", { name: CHOICE_LABEL[item.expected], exact: true }).click();
  }
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
  await expect(page.getByRole("heading", { name: "给词打分与概率" })).toBeVisible();

  // Edit one Stage 2 slider, wait specifically for Stage 2's autosave PUT /draft, reload, and verify both stage unlock & draft restore
  const draftSavePromise = page.waitForResponse((res) => {
    if (res.request().method() !== "PUT" || !res.url().endsWith("/labs/ml-intro/draft")) {
      return false;
    }
    const body = res.request().postDataJSON() as {
      stageIndex?: number;
      draft?: { weights?: Record<string, number> };
    } | null;
    return body?.stageIndex === 2 && body.draft?.weights?.["免费"] === 2.2;
  });
  await page.locator("#ml-w-免费").fill("2.2");
  await expect(page.locator("#ml-w-免费")).toHaveValue("2.2");
  const draftSaveRes = await draftSavePromise;
  expect(draftSaveRes.status()).toBe(200);
  expect((await draftSaveRes.json()) as { applied?: boolean }).toMatchObject({ applied: true });
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "给词打分与概率" })).toBeVisible();
  await expect(page.locator("#ml-w-免费")).toHaveValue("2.2");

  // Stage 2: Finish manual weights on 6 calibration messages
  const s2Weights: Record<string, string> = {
    免费: "2.2",
    领取: "2",
    点击: "2",
    退订: "2",
    优惠: "2",
    同学: "-2",
    明天: "-1.6",
    一起: "-1.6",
  };
  for (const [word, val] of Object.entries(s2Weights)) {
    await page.locator(`#ml-w-${word}`).fill(val);
  }
  await expect(page.getByText("分对 6 / 6")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "让机器自己改错" })).toBeVisible();

  // Stage 3: Steady learning rate preset + concepts
  await page.getByRole("button", { name: "稳健 η = 0.1" }).click();
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
  await expect(page.getByRole("heading", { name: "别被高分假象骗了" })).toBeVisible();

  // Stage 4: Restore balanced threshold + verify UI explanation parity + concepts
  await page.getByRole("button", { name: "恢复推荐初值" }).click();
  const firstCaseBtn = page.locator(".ml-case-btn").first();
  await expect(firstCaseBtn).toBeVisible();
  const listProb = (await firstCaseBtn.locator(".ml-case-prob").textContent())?.trim() ?? "";
  expect(listProb).toMatch(/^\d+\.\d%$/);
  await expect(page.getByText(new RegExp(`模型判定：.*（${listProb}）`))).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "数据规模与未知大考" })).toBeVisible();

  // Stage 5: Full training sample preset + sealed blind exam
  await page.getByRole("button", { name: "1,400 条（全量公开训练）" }).click();
  for (const prompt of ML_STAGES[4].prompts) {
    await page
      .getByRole("button", { name: prompt.options[prompt.correct].label, exact: true })
      .click();
  }
  const s5RespPromise = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交并挑战 300 条隐藏测试集" }).click();
  const s5Resp = await s5RespPromise;
  expect(s5Resp.status()).toBe(200);
  const s5BodyText = await s5Resp.text();
  expect(s5BodyText).not.toContain("test-accuracy");
  expect(s5BodyText).not.toContain("瑞金北村小学");

  await expect(page.getByText("通过本关判定")).toBeVisible();
  await expect(page.getByText("300 条隐藏测试集结业盲测", { exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});

test("lists ml-intro in admin/teacher lab management and renders its matrix & drawer in class dashboard", async ({
  page,
  request,
}) => {
  const failures = collectFailures(page);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("admin");
  await page.getByLabel("密码").fill("admin-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("admin/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "实验管理" })).toBeVisible();
  await expect(page.getByRole("row", { name: /机器学习入门\s*ml-intro\s*5/ })).toBeVisible();

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

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("teacher/labs", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /机器学习入门\s*ml-intro\s*5/ })).toBeVisible();

  await page.goto(`classes/${classId}/dashboard?lab=ml-intro`, { waitUntil: "networkidle" });
  await expect(page.getByRole("combobox", { name: "选择实验" })).toHaveValue("ml-intro");
  for (const stage of ML_STAGES) {
    await expect(
      page.getByRole("columnheader", { name: stage.englishTitle ?? stage.title }),
    ).toBeVisible();
  }

  const studentRow = page.getByRole("row", { name: new RegExp(studentNo) });
  await studentRow.getByRole("button", { name: "0/10" }).click();
  await expect(page.getByRole("dialog", { name: "提交详情" })).toBeVisible();
  await expect(page.getByText("切词与特征归类")).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
