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

test("unlocks stage 2 of ml-intro through real API submission", async ({ page, request }) => {
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
      name: "ML Smoke Student",
      password: studentPassword,
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  await page.goto("login", { waitUntil: "networkidle" });
  await page.getByLabel("学号").fill(studentNo);
  await page.getByLabel("密码").fill(studentPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/");

  await page.goto("labs/ml-intro", { waitUntil: "networkidle" });
  await expect(page.getByRole("main", { name: "机器学习入门实验区" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "把短信变成数字" })).toBeVisible();
  await expect(page.getByRole("button", { name: /给词打分与概率/ })).toBeDisabled();

  let freeSeen = 0;
  for (const item of STAGE1_PUZZLE_ITEMS) {
    const label = `片段 ${item.text} 的归类`;
    const group =
      item.text === "免费"
        ? page.getByRole("group", { name: label }).nth(freeSeen++)
        : page.getByRole("group", { name: label });
    await group.getByRole("button", { name: CHOICE_LABEL[item.expected] }).click();
  }

  for (const prompt of ML_STAGES[0].prompts) {
    await page.getByRole("button", { name: prompt.options[prompt.correct].label }).click();
  }

  const judgeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith("/labs/ml-intro/judge"),
  );
  await page.getByRole("button", { name: "提交第 1 关判定" }).click();
  expect((await judgeResponse).status()).toBe(200);

  await expect(page.getByText("通过本关判定")).toBeVisible();
  await expect(page.getByRole("button", { name: /给词打分与概率/ })).toBeEnabled();

  await page.getByRole("button", { name: /进入下一关/ }).click();
  await expect(page.getByRole("heading", { name: "给词打分与概率" })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
