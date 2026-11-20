import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function enterLesson(page: Page, request: APIRequestContext, asStudent: boolean) {
  let studentNo = process.env.LAB_TEACHER_STUDENT_NO ?? "teacher";
  let password = process.env.LAB_TEACHER_PASSWORD ?? "teacher-dev-password";
  if (asStudent) {
    const admin = await request.post("/api/auth/login", {
      data: {
        studentNo: process.env.LAB_ADMIN_STUDENT_NO ?? "admin",
        password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password",
      },
    });
    expect(admin.ok()).toBe(true);
    const { memberships } = (await admin.json()) as { memberships: { classId: string }[] };
    studentNo = `receiver-${randomUUID().slice(0, 18)}`;
    password = randomUUID();
    const student = await request.post("/api/admin/users", {
      data: {
        studentNo,
        name: "收信练习学生",
        password,
        classId: memberships[0].classId,
        role: "user",
      },
    });
    expect(student.status()).toBe(201);
  }
  const login = await page.request.post("/api/auth/login", { data: { studentNo, password } });
  expect(login.ok()).toBe(true);
  const { memberships } = (await login.json()) as { memberships: { classId: string }[] };
  await page.goto(`classes/${memberships[0].classId}/labs/image-sampling?stage=1`);
}

for (const { width, asStudent } of [
  { width: 390, asStudent: true },
  { width: 1440, asStudent: false },
]) {
  test(`a ${asStudent ? "student" : "teacher"} receives the same badge twice at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(30_000);
    const errors: string[] = [];
    const labWrites: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (path.includes("/api/") && path.includes("/image-sampling/") && req.method() !== "GET") {
        labWrites.push(`${req.method()} ${path}`);
      }
    });
    await page.setViewportSize({ width, height: 900 });
    await enterLesson(page, request, asStudent);

    const start = page.getByRole("button", { name: "开始接收端挑战" });
    const sender = page.getByRole("button", { name: /接收端看到的/ });
    await expect(sender).toBeVisible();
    await start.press("Enter");

    const challenge = page.getByRole("region", { name: "接收端挑战" });
    const packet = challenge.getByRole("button", { name: "匿名来包网格" });
    const submit = challenge.getByRole("button", { name: "提交判断" });
    const feedback = challenge.getByRole("status", { name: "判断反馈" });
    const readout = challenge.getByRole("status", { name: "同位读数" });
    const onlyB = challenge.getByRole("radio", { name: "只可能乙" });
    const both = challenge.getByRole("radio", { name: "两枚都可能" });
    const resend = challenge.getByRole("button", { name: "请求重发 8×8" });
    await expect(sender).toHaveCount(0);
    await expect(challenge.getByText("4×4 · 本包 16 格")).toBeVisible();
    await expect(resend).toHaveCount(0);
    await challenge.screenshot({ path: testInfo.outputPath("receiver-coarse.png") });

    await onlyB.press("Space");
    await submit.press("Enter");
    await expect(feedback).toContainText("有没有一格能排除另一枚");
    await packet.press("Enter");
    await submit.press("Enter");
    await expect(feedback).toContainText("排除不了任何一枚");
    await onlyB.press("ArrowRight");
    await expect(both).toBeChecked();
    await expect(feedback).toBeEmpty();
    await submit.press("Enter");
    await expect(challenge.getByRole("heading", { name: "全班预测" })).toBeFocused();
    await expect(feedback).toContainText("16 格逐格都相同");
    await expect(challenge.getByRole("status", { name: "同位读数" })).toHaveCount(0);
    await challenge.screenshot({ path: testInfo.outputPath("receiver-prediction.png") });
    await expect(resend).toBeInViewport({ ratio: 1 });
    await resend.press("Enter");

    await expect(challenge.getByRole("heading", { name: /第 2 轮/ })).toBeFocused();
    await expect(challenge.getByText("8×8 · 本包 64 格")).toBeVisible();
    await expect(onlyB).not.toBeChecked();
    await expect(readout).toHaveText("尚未选格");
    await challenge.screenshot({ path: testInfo.outputPath("receiver-fine.png") });
    const rowsToggle = challenge.getByText("按行查看 0/1");
    const rows = challenge.getByRole("table", { name: /各行格值/ });
    await expect(rows).toHaveCount(0);
    await rowsToggle.press("Enter");
    await expect(rows.getByRole("row")).toHaveCount(9);
    const rowFour = rows.getByRole("row").nth(4).getByRole("cell");
    const [received, candidateA, candidateB] = await rowFour.allTextContents();
    expect(received.split(" ")).toHaveLength(8);
    expect(received).toBe(candidateB);
    expect(received).not.toBe(candidateA);
    await rowsToggle.press("Enter");
    await onlyB.press("Space");
    await submit.press("Enter");
    await expect(feedback).toContainText("还要指出一格");

    await packet.press("Enter");
    await submit.press("Enter");
    await expect(feedback).toContainText("排除不了任何一枚");
    if (asStudent) {
      for (let moves = 0; moves < 5; moves += 1) await packet.press("ArrowRight");
      for (let moves = 0; moves < 3; moves += 1) await packet.press("ArrowDown");
    } else {
      const bounds = (await packet.boundingBox())!;
      await packet.click({
        position: { x: (bounds.width * 5.5) / 8, y: (bounds.height * 3.5) / 8 },
      });
    }
    await expect(readout).toHaveText("第 4 行，第 6 列 · 来包 1 · 甲 0 · 乙 1");
    await expect(feedback).toBeEmpty();
    expect(
      await challenge.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await submit.press("Enter");
    await expect(challenge.getByRole("heading", { name: "一格证据" })).toBeFocused();
    await expect(feedback).toContainText("只可能来自乙");
    await expect(challenge.getByText("黑色 32 / 64，刚好一半", { exact: false })).toBeVisible();
    await expect(challenge.getByRole("img", { name: /候选[甲乙]原图裁切/ })).toHaveCount(2);
    await challenge.locator(".receiver-result").screenshot({
      path: testInfo.outputPath("receiver-proof.png"),
    });

    await challenge.getByRole("button", { name: "重玩本题" }).press("Enter");
    await expect(challenge.getByText("4×4 · 本包 16 格")).toBeVisible();
    await expect(readout).toHaveText("尚未选格");
    await expect(feedback).toBeEmpty();
    await challenge.getByRole("button", { name: "返回发送端" }).press("Enter");
    await expect(sender).toBeVisible();
    if (!asStudent) {
      const nextBadge = page.getByRole("option", { name: "查看 V-02" });
      await nextBadge.click();
      await expect(nextBadge).toHaveAttribute("aria-selected", "true");
      await start.press("Enter");
      await page.getByRole("button", { name: /机器人的细微差别/ }).click();
      await expect(page.getByText(/本关必须先写并运行 choose_size/)).toBeVisible();
      await expect(start).toHaveCount(0);
      await page.getByRole("button", { name: /多少个格子才够/ }).click();
      await expect(start).toBeVisible();
      await expect(nextBadge).toHaveAttribute("aria-selected", "true");
    }
    expect(labWrites).toEqual([]);
    expect(errors).toEqual([]);
  });
}
