import { expect, test, type Page } from "@playwright/test";
import { fullAdderPrimitiveGraph } from "../../src/features/calculator/domain/fixtures";

async function createStudent(page: Page) {
  const admin = await page.request.post("/api/auth/login", {
    data: { studentNo: "admin", password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password" },
  });
  expect(admin.ok()).toBe(true);
  const {
    memberships: [{ classId }],
  } = await admin.json();
  const studentNo = `editor-${crypto.randomUUID().slice(0, 8)}`;
  const password = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/admin/users", {
        data: { studentNo, password, name: studentNo, classId, role: "user" },
      })
    ).status(),
  ).toBe(201);
  return { classId, studentNo, password };
}

test("partial reset removes a lost FullAdder from a retained draft and resumes autosave", async ({
  page,
}) => {
  const { classId, studentNo, password } = await createStudent(page);
  expect((await page.request.post("/api/auth/login", { data: { studentNo, password } })).ok()).toBe(
    true,
  );
  const lab = `classes/${classId}/labs/calculator`;
  const pass = await page.request.post(`/api/${lab}/judge`, {
    data: { stageIndex: 3, expectedGeneration: 0, graph: fullAdderPrimitiveGraph() },
  });
  expect(await pass.json()).toMatchObject({ passed: true });
  await page.goto(`${lab}?stage=2`);
  await page.getByRole("button", { name: "FullAdder", exact: true }).click();
  await page.getByRole("button", { name: "XOR", exact: true }).click();
  await page.getByRole("button", { name: "FullAdder 输出 Sum", exact: true }).click();
  await page.getByRole("button", { name: "XOR 输入 in0", exact: true }).click();
  await expect(page.locator(".wires path")).toHaveCount(1);
  await page.getByRole("button", { name: /全加器/ }).click();
  await page.getByRole("button", { name: "重置进度" }).click();
  await page.getByRole("button", { name: "确认重置" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "第 2 关草稿已移除失效组件 FullAdder" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /半加器/ }).click();
  await expect(page.locator(".kind-xor")).toHaveCount(1);
  await expect(page.locator(".kind-component, .wires path")).toHaveCount(0);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/draft") && r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "AND", exact: true }).click();
  expect(await (await saved).json()).toMatchObject({ applied: true });
  await page.reload();
  await expect(page.locator(".kind-and")).toHaveCount(1);
  await expect(page.locator(".kind-xor")).toHaveCount(1);
  await expect(page.locator(".kind-component, .wires path")).toHaveCount(0);
});

test("repeated gates and constants occupy free slots and reset cancellation preserves selections", async ({
  page,
}) => {
  const { classId, studentNo, password } = await createStudent(page);
  expect((await page.request.post("/api/auth/login", { data: { studentNo, password } })).ok()).toBe(
    true,
  );
  await page.goto(`classes/${classId}/labs/calculator?stage=4`);
  for (const name of ["常量 0", "常量 1"]) {
    const add = page.getByRole("button", { name, exact: true });
    await add.click();
    await add.click();
  }
  const and = page.getByRole("button", { name: "AND", exact: true });
  for (let i = 0; i < 7; i++) await and.click();
  const nodes = page.locator(".kind-and .node-body, .kind-const .pin-body");
  await expect(nodes).toHaveCount(11);
  const boxes = await nodes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  for (let i = 0; i < boxes.length; i++)
    for (const b of boxes.slice(i + 1)) {
      const a = boxes[i];
      expect(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left).toBe(
        true,
      );
    }
  await page.getByRole("button", { name: "重置进度" }).click();
  const cancel = page.getByRole("button", { name: "取消" });
  await cancel.press("Delete");
  await cancel.press("Control+z");
  await cancel.press("Meta+z");
  await cancel.click();
  await expect(nodes).toHaveCount(11);
  await expect(page.locator(".kind-and.is-selected")).toHaveCount(1);
});

test("admin delete and roster removal dialogs contain focus and return it to the trigger", async ({
  page,
}) => {
  const { classId, studentNo } = await createStudent(page);
  const name = `空班-${studentNo}`;
  expect((await page.request.post("/api/admin/classes", { data: { name } })).status()).toBe(201);
  for (const [path, row, action] of [
    ["admin/classes", name, "删除"],
    ["admin", studentNo, "删除"],
    [`classes/${classId}/members`, studentNo, "移出班级"],
  ]) {
    await page.goto(path);
    if (path === "admin") {
      const search = page.getByRole("searchbox", { name: "搜索学号或姓名" });
      await search.fill(studentNo);
      await search.press("Enter");
    }
    const trigger = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: row, exact: true }) })
      .getByRole("button", { name: action, exact: true });
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog");
    const cancel = dialog.getByRole("button", { name: "取消" });
    await expect(cancel).toBeFocused();
    expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);
    await cancel.press("Tab");
    await expect(dialog.getByRole("button", { name: /确认删除|确认移出/ })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await cancel.press("Enter");
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
