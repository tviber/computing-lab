import { expect, test } from "@playwright/test";
import { halfAdderGraph } from "../../src/features/calculator/domain/fixtures";

test("the full-adder guide stays in the lower left until acknowledged and stays dismissed on reload", async ({
  page,
  request,
}) => {
  const admin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password" },
  });
  expect(admin.ok()).toBe(true);
  const {
    memberships: [membership],
  } = await admin.json();
  const studentNo = `guide-${Date.now()}`;
  const password = crypto.randomUUID();
  const created = await request.post("/api/admin/users", {
    data: { studentNo, password, name: "ALU 引导测试", role: "user", classId: membership.classId },
  });
  expect(created.status()).toBe(201);
  expect((await page.request.post("/api/auth/login", { data: { studentNo, password } })).ok()).toBe(
    true,
  );
  const lab = `classes/${membership.classId}/labs/calculator`;
  await page.goto(`${lab}?stage=2`);
  const confirm = page.getByRole("button", { name: "我知道了" });
  await expect(page.getByRole("heading", { name: "实现ALU - 半加器", exact: true })).toBeVisible();
  await expect(confirm).toHaveCount(0);
  const project = await (await page.request.get(`/api/${lab}/project`)).json();
  const judge = await page.request.post(`/api/${lab}/judge`, {
    data: { stageIndex: 2, expectedGeneration: project.projectGeneration, graph: halfAdderGraph() },
  });
  expect(await judge.json()).toMatchObject({ passed: true });
  await page.reload();
  await page.getByRole("button", { name: /全加器/ }).click();
  const card = page.getByRole("region", { name: "用上你搭好的半加器" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(24);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(800 - box.y - box.height).toBeCloseTo(16, 0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const shelfButton = page.getByRole("button", { name: "HalfAdder", exact: true });
  await shelfButton.click();
  await shelfButton.click();
  const halves = page.locator(".circuit-node.kind-component").filter({ hasText: "HalfAdder" });
  await expect(halves).toHaveCount(2);
  const first = halves.first();
  const bodies = halves.locator(".node-body");
  const [a, b] = await bodies.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().toJSON()),
  );
  expect(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left).toBe(
    true,
  );

  await first.getByRole("button", { name: "HalfAdder 输出 Sum", exact: true }).click();
  await halves.last().getByRole("button", { name: "HalfAdder 输入 A", exact: true }).click();
  await first.locator(".node-body").click();
  await page.getByRole("button", { name: "封装为自定义组件" }).click();
  const create = page.getByRole("dialog", { name: "把框选部分变成组件" });
  await expect(create).toBeVisible();
  await expect(confirm).toBeHidden();
  await create.getByLabel("组件名称").fill("FirstHalf");
  await create.getByRole("button", { name: "封装并替换" }).click();
  await expect(confirm).toBeVisible();

  await page.getByRole("button", { name: "编辑自定义组件 FirstHalf" }).click();
  const edit = page.getByRole("dialog", { name: "编辑自定义组件" });
  await expect(edit).toBeVisible();
  await expect(confirm).toBeHidden();
  await edit.getByRole("button", { name: "取消" }).click();
  await expect(confirm).toBeVisible();
  await page.reload();
  await expect(confirm).toBeVisible();
  await confirm.press("Enter");
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "实现ALU - 全加器", exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
});
