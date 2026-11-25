import { expect, test } from "@playwright/test";

test("fields keep their bounds on direct admin entry, keyboard focus and class selection", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "admin", studentNo: "admin", name: "管理员", role: "admin" },
        memberships: [],
      },
    }),
  );
  await page.route("**/api/admin/classes", (route) =>
    route.fulfill({
      json: { classes: [{ id: "long", name: "信息技术综合实践实验教学示范班".repeat(4) }] },
    }),
  );
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({ json: { users: [], total: 0, page: 1, pageSize: 50 } }),
  );
  await page.goto("admin");
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
