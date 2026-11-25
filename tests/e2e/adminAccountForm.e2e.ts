import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "admin", studentNo: "admin", name: "管理员", role: "admin" },
        memberships: [],
      },
    }),
  );
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({
      json: {
        users: [
          {
            id: "u1",
            studentNo: "20251101",
            name: "常奕璇",
            role: "user",
            createdAt: "2026-01-01",
            classes: [{ classId: "old", className: "2026-高二信息技术-11", role: "student" }],
          },
        ],
        total: 782,
        page: 1,
        pageSize: 50,
      },
    }),
  );
  await page.route("**/api/admin/classes", (route) =>
    route.fulfill({
      json: { classes: [{ id: "long", name: "信息技术综合实践实验教学示范班".repeat(4) }] },
    }),
  );
});

test("fields keep their bounds on direct admin entry, keyboard focus and class selection", async ({
  page,
}, testInfo) => {
  await page.goto("admin");
  const tableRegion = page.getByRole("region", { name: "账号列表" });
  const adminSelect = tableRegion.getByRole("combobox", { name: "常奕璇 的角色" });
  await expect(adminSelect).toHaveCSS("border-top-width", "1px");
  await adminSelect.focus();
  await expect(adminSelect).toHaveCSS("outline-style", "solid");
  await expect(adminSelect).toHaveCSS("box-shadow", "none");
  await testInfo.attach("accounts-desktop.png", {
    body: await tableRegion.screenshot(),
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await testInfo.attach("accounts-mobile.png", {
    body: await tableRegion.screenshot(),
    contentType: "image/png",
  });
  const form = page.getByRole("form", { name: "创建账号" });
  const role = form.getByLabel("角色");
  const klass = form.getByLabel("分配班级（可选）");
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(form).toHaveCSS("display", "grid");
    await expect(role).toHaveCSS("border-top-width", "1px");
    const bounds = () =>
      form.locator("input, select").evaluateAll((controls) =>
        controls.map((control) => {
          const { left, right, top, bottom } = control.getBoundingClientRect();
          return { left, right, top, bottom };
        }),
      );
    const initial = await bounds();
    expect(initial[1].top === initial[0].top).toBe(width === 1280);
    for (const [i, box] of initial.entries()) {
      expect(box.left).toBeGreaterThan(0);
      expect(box.right).toBeLessThan(width);
      for (const other of initial.slice(i + 1)) {
        expect(
          box.right < other.left ||
            other.right < box.left ||
            box.bottom < other.top ||
            other.bottom < box.top,
        ).toBe(true);
      }
    }
    await form.getByLabel("初始密码").focus();
    await page.keyboard.press("Tab");
    await expect(role).toBeFocused();
    await role.selectOption("teacher");
    await role.press("Tab");
    await expect(klass).toBeFocused();
    await klass.selectOption("long");
    expect(await bounds()).toEqual(initial);
    await testInfo.attach(`account-${width}`, {
      body: await form.screenshot(),
      contentType: "image/png",
    });
    await klass.selectOption("");
  }
});

test("reviews a CSV file before importing and reads partial results on a narrow screen", async ({
  page,
}, testInfo) => {
  const csv = "20260101,张三,pass123\n20260102,李四,pass456";
  let submissions = 0;
  await page.route("**/api/admin/users/import", async (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({ csv });
    await route.fulfill({
      json: {
        created: 1,
        failed: 0,
        exists: 1,
        rows: [{ line: 2, studentNo: "20260102", status: "exists" }],
      },
    });
  });
  await page.goto("admin");
  const panel = page.getByRole("region", { name: "批量导入账号", exact: true });
  const text = panel.getByRole("textbox", { name: "账号名单" });
  const submit = panel.getByRole("button", { name: "开始导入" });
  await expect(submit).toBeDisabled();
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(text).toBeVisible();
    await testInfo.attach(`import-${width}`, {
      body: await panel.screenshot(),
      contentType: "image/png",
    });
  }
  await panel
    .getByLabel("选择 CSV 文件")
    .setInputFiles({ name: "班级名单.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(text).toHaveValue(csv);
  await expect(panel.getByText("已读取 班级名单.csv")).toBeVisible();
  expect(submissions).toBe(0);
  await submit.click();
  await expect(panel.getByRole("table", { name: "未创建的账号" })).toContainText("已存在，跳过");
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await text.fill("[");
  await expect(panel.getByRole("table")).toHaveCount(0);
  await submit.click();
  await expect(panel.getByRole("alert")).toContainText("JSON 解析失败");
  expect(submissions).toBe(1);
});
