import { expect, test } from "@playwright/test";
import { referenceSolutions } from "../../src/features/calculator/domain/fixtures";
import { CALCULATOR_STAGES } from "../../src/features/calculator/domain/stages";

test("switching ALU stages replaces every wire, including wires from legacy drafts", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/login", {
    data: { studentNo: "admin", password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password" },
  });
  expect(login.ok()).toBe(true);
  const { memberships } = await login.json();
  const lab = `classes/${memberships[0].classId}/labs/calculator`;
  const drafts = referenceSolutions();
  // Older drafts can have distinct connections with the same saved wire ID.
  drafts[8].edges[1].id = drafts[8].edges[0].id;
  await page.route(`**/api/${lab}/project`, (route) =>
    route.fulfill({
      json: {
        currentStage: 8,
        passedStages: CALCULATOR_STAGES.map((stage) => stage.index),
        unlockedSubmodules: CALCULATOR_STAGES.flatMap((stage) =>
          stage.unlocks ? [{ name: stage.unlocks, graph: drafts[stage.index] }] : [],
        ),
        fullAdderGuideAcknowledged: true,
        drafts,
      },
    }),
  );

  await page.goto(`${lab}?stage=8`);
  const canvas = page.getByRole("application", { name: "电路画布" });
  const wires = canvas.locator(".wire");
  await expect(wires).toHaveCount(drafts[8].edges.length);
  const rail = page.getByRole("complementary", { name: "关卡进度" });
  for (const index of [2, 1, 3, 4, 5, 6, 9, 10, 11, 7, 8, 2]) {
    const stage = CALCULATOR_STAGES.find((stage) => stage.index === index)!;
    const button = rail.locator(".lab-stage-link").filter({ hasText: stage.title });
    if (await button.isHidden()) {
      await button.locator("xpath=ancestor::details[1]/summary").click();
    }
    await button.click();
    await expect(
      page.getByRole("heading", { name: `实现ALU - ${stage.title}`, exact: true }),
    ).toBeVisible();
    await expect(wires).toHaveCount(drafts[index].edges.length);
    await expect(canvas.locator(".circuit-node")).toHaveCount(drafts[index].nodes.length);
  }
});
