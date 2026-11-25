import { expect, test } from "@playwright/test";

test("keeps dashboard filters aligned across classes and categories", async ({ page }) => {
  const memberships = [
    { classId: "short", className: "1101", role: "teacher" },
    { classId: "long", className: "2026-高二信息技术-01（实验教学示范班）", role: "teacher" },
  ];

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "teacher", studentNo: "teacher", name: "值班教师", role: "teacher" },
        memberships,
      },
    }),
  );
  await page.route("**/api/labs", (route) =>
    route.fulfill({
      json: {
        labs: [
          { id: "calculator", visible: true, visibleClassIds: ["short", "long"] },
          { id: "logistic-regression", visible: true, visibleClassIds: ["long"] },
        ],
      },
    }),
  );
  await page.route("**/api/classes/*/dashboard?*", (route) => {
    const membership = memberships.find(({ classId }) =>
      route.request().url().includes(`/classes/${classId}/`),
    );
    return route.fulfill({ json: { ...membership, rows: [] } });
  });
  await page.route("**/api/classes/*/task-assignments", (route) =>
    route.fulfill({ json: { assignments: [] } }),
  );

  const classSelect = page.getByRole("combobox", { name: "选择班级" });
  const category = page.getByRole("combobox", { name: "看板分类" });
  const subject = page.getByRole("combobox", { name: /选择(实验|任务单)/ });
  const members = page.getByRole("link", { name: "成员管理" });
  const layout = async () => {
    const boxes = [];
    for (const control of [classSelect, category, subject, members]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (!box) throw new Error("Dashboard control has no layout box");
      boxes.push(box);
    }
    return boxes;
  };

  for (const [width, rows] of [
    [1080, 1],
    [640, 2],
    [375, 3],
    [320, 4],
  ]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("classes/short/dashboard");
    await expect(classSelect).toHaveValue("short");
    const before = await layout();
    expect(new Set(before.map(({ y }) => Math.round(y))).size).toBe(rows);
    for (const box of before) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }

    await classSelect.selectOption("long");
    await expect(members).toHaveAttribute("href", /\/classes\/long\/members$/);
    await subject.selectOption("logistic-regression");
    await expect(subject).toHaveValue("logistic-regression");
    expect(await layout()).toEqual(before);

    await category.selectOption("task");
    await expect(page.getByRole("heading", { name: "任务单提交" })).toBeVisible();
    await expect(subject).toBeDisabled();
    expect(await layout()).toEqual(before);
  }
});
