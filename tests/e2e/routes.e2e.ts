import { expect, test, type Page } from "@playwright/test";
import { wireGraph } from "../../src/features/calculator/domain/fixtures.ts";

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

test("serves the root app, calculator entry, and not-found fallback", async ({ page }) => {
  const failures = collectFailures(page);

  const root = await page.goto(".", { waitUntil: "networkidle" });
  expect(root?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/计算实验室/);

  const calculator = await page.goto("labs/calculator", { waitUntil: "networkidle" });
  expect(calculator?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText("登录");

  await page.goto("__dev/labs/decoding?scenario=initial", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /实验不存在/ })).toBeVisible();
  await expect(page.getByRole("main", { name: "解码实验区" })).toHaveCount(0);

  const missing = await page.goto("missing-route", { waitUntil: "networkidle" });
  expect(missing?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/实验不存在/);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("admin dropdown opens account, class, and lab management as separate pages", async ({
  page,
}) => {
  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("admin");
  await page.getByLabel("密码").fill("admin-dev-password");
  await page.getByRole("button", { name: "登录" }).click();

  const accountMenu = page.getByRole("button", { name: /管理员/ });
  await expect(accountMenu).toBeVisible();

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "账号管理" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "班级管理" }).click();
  await expect(page).toHaveURL(/\/admin\/classes$/);
  await expect(page.getByRole("heading", { name: "班级管理" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);

  await accountMenu.click();
  await page.getByRole("menuitem", { name: "实验管理" }).click();
  await expect(page).toHaveURL(/\/admin\/labs$/);
  await expect(page.getByRole("heading", { name: "实验管理" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("browser back leaves a lab and forward reopens it without a redirect loop", async ({
  page,
}) => {
  const failures = collectFailures(page);
  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "实验课程" })).toBeVisible();
  const homeUrl = page.url();

  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "实现ALU" }) });
  await card.getByRole("link", { name: "开始实验" }).click();
  await expect(page.getByRole("main", { name: "计算器实验区" })).toBeVisible();
  const labUrl = page.url();
  expect(labUrl).toMatch(/\/classes\/[^/]+\/labs\/calculator/);

  const verifyUndo = async () => {
    const skip = page.getByRole("button", { name: "跳过引导", exact: true });
    if (await skip.isVisible()) await skip.click();
    const input = page.getByRole("button", { name: /^切换 A，当前 [01]$/ });
    const before = await input.getAttribute("aria-label");
    await input.click();
    await expect(input).not.toHaveAttribute("aria-label", before!);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(input).toHaveAttribute("aria-label", before!);
    await input.click();
    await expect(input).not.toHaveAttribute("aria-label", before!);
    await page.keyboard.press("Meta+z");
    await expect(input).toHaveAttribute("aria-label", before!);
    await expect(page).toHaveURL(labUrl);
  };
  await verifyUndo();

  await page.goBack();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.getByRole("heading", { name: "实验课程" })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(labUrl);
  await expect(page.getByRole("main", { name: "计算器实验区" })).toBeVisible();
  await verifyUndo();
  await page.goBack();
  await expect(page).toHaveURL(homeUrl);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("teacher manages the roster of their own class from the members page", async ({
  page,
  request,
}) => {
  // Seed: one unattached student account that the teacher will enroll.
  const adminLogin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: "admin-dev-password" },
  });
  expect(adminLogin.status()).toBe(200);
  const outsiderNo = `e2e-out-${Date.now()}`;
  const createOutsider = await request.post("/api/admin/users", {
    data: { studentNo: outsiderNo, name: "转入学生", password: "e2e-password", role: "user" },
  });
  expect(createOutsider.status()).toBe(201);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill("teacher");
  await page.getByLabel("密码").fill("teacher-dev-password");
  await page.getByRole("button", { name: "登录" }).click();

  // Account menu → 班级成员 lands on the roster page of the taught class.
  await page.getByRole("button", { name: /教师/ }).click();
  await page.getByRole("menuitem", { name: "班级成员" }).click();
  await expect(page).toHaveURL(/\/classes\/[^/]+\/members$/);
  await expect(page.getByRole("heading", { name: "班级成员" })).toBeVisible();

  // Enroll the unattached account by student number.
  await page.getByLabel("学生学号").fill(outsiderNo);
  await page.getByRole("button", { name: "加入班级" }).click();
  await expect(page.getByRole("row", { name: new RegExp(outsiderNo) })).toBeVisible();

  // Create a fresh student account directly into the class.
  const freshmanNo = `e2e-new-${Date.now()}`;
  await page.getByLabel("学号", { exact: true }).fill(freshmanNo);
  await page.getByLabel("姓名").fill("新学生");
  await page.getByLabel("初始密码").fill("pw-e2e");
  await page.getByRole("button", { name: "创建并入班" }).click();
  await expect(page.getByRole("row", { name: new RegExp(freshmanNo) })).toBeVisible();

  // Remove the enrolled student again; the account itself survives.
  await page
    .getByRole("row", { name: new RegExp(outsiderNo) })
    .getByRole("button", { name: "移出班级" })
    .click();
  await page.getByRole("button", { name: "确认移出" }).click();
  await expect(page.getByRole("row", { name: new RegExp(outsiderNo) })).toHaveCount(0);
});

test("completes the first calculator stage through the real API", async ({ page, request }) => {
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

  const studentNo = `e2e-${Date.now()}`;
  const studentPassword = "e2e-password";
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "API smoke student",
      password: studentPassword,
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill(studentNo);
  await page.getByLabel("密码").fill(studentPassword);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "登录" }).click();
  expect((await loginResponse).status()).toBe(200);

  await page.goto(`classes/${classId}/labs/calculator`, { waitUntil: "networkidle" });
  await expect(page.getByRole("main", { name: "计算器实验区" })).toBeVisible();

  const browserRequest = page.context().request;
  const projectPath = `/api/classes/${classId}/labs/calculator/project`;
  const initialProject = await browserRequest.get(projectPath);
  expect(initialProject.status()).toBe(200);
  await expect(initialProject.json()).resolves.toMatchObject({
    currentStage: 1,
    passedStages: [],
  });

  const graph = wireGraph();
  const draft = await browserRequest.put(`/api/classes/${classId}/labs/calculator/draft`, {
    data: {
      stageIndex: 1,
      graph,
      components: [],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    },
  });
  expect(draft.status()).toBe(200);

  const judge = await browserRequest.post(`/api/classes/${classId}/labs/calculator/judge`, {
    data: { stageIndex: 1, graph, components: [] },
  });
  expect(judge.status()).toBe(200);
  await expect(judge.json()).resolves.toMatchObject({
    passed: true,
    currentStage: 2,
    passedStages: [1],
  });

  const savedProject = await browserRequest.get(projectPath);
  expect(savedProject.status()).toBe(200);
  await expect(savedProject.json()).resolves.toMatchObject({
    currentStage: 2,
    passedStages: [1],
  });

  expect(failures, failures.join("\n")).toEqual([]);
});
