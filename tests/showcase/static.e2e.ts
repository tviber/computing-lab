import { expect, test, type Locator } from "@playwright/test";
import { LAB_IDS, labMetadata } from "../../src/shared/lab/labMetadata";
import { readFileSync, readdirSync } from "node:fs";

async function moveSlider(slider: Locator, value: number) {
  const step = Number(await slider.getAttribute("step"));
  const steps = Math.round((value - Number(await slider.inputValue())) / step);
  await slider.focus();
  for (let index = 0; index < Math.abs(steps); index++)
    await slider.press(steps > 0 ? "ArrowRight" : "ArrowLeft");
  await expect(slider).toHaveValue(String(value));
}

test("built showcase includes no classroom chunks or API requests; every lab opens anonymously", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  const mathAssets: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
    if (/\/assets\/(?:MathFormula-|KaTeX_)/.test(new URL(request.url()).pathname)) {
      mathAssets.push(request.url());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const manifest = readFileSync("dist/.vite/manifest.json", "utf8");
  expect(manifest).not.toMatch(
    /LoginPage|AdminPage|TeacherDashboard|TaskSheet|TaskAssignment|classroom-main/,
  );
  for (const asset of readdirSync("dist/assets").filter((name) => name.endsWith(".js"))) {
    expect(readFileSync(`dist/assets/${asset}`, "utf8")).not.toMatch(
      /\/api\/(?:auth|classes|admin|labs)|invalid-credentials|teacher-required/,
    );
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "进入实验" })).toHaveCount(LAB_IDS.length);
  expect(mathAssets).toEqual([]);
  await expect(page.locator(".atlas-spec math")).toHaveCount(0);
  for (const id of LAB_IDS) {
    await page.goto(`/labs/${id}`);
    await expect(
      page.getByRole("heading", { name: new RegExp(labMetadata[id].title) }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "重置进度", exact: true })).toBeEnabled();
    await expect(page.getByRole("link", { name: "去登录" })).toHaveCount(0);
  }
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "实验不存在" })).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("local statistics draft survives reload, passes and unlocks, then resets", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
  });
  await page.goto("/labs/stats-foundations");
  const next = page.getByRole("button", { name: /条件概率：校园气象台/ });
  await expect(next).toBeDisabled();
  await moveSlider(page.getByRole("slider", { name: /斜率 w/ }), 3.2);
  await moveSlider(page.getByRole("slider", { name: /截距 b/ }), -22);
  await page.getByRole("button", { name: /正误差和负误差/ }).click();
  await expect(page.getByText(/平方后所有误差都变成非负数/)).toBeVisible();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("slider", { name: /斜率 w/ })).toHaveValue("3.2");
  await expect(page.getByText(/平方后所有误差都变成非负数/)).toBeVisible();
  await page.getByRole("button", { name: "提交检查本关" }).click();
  await expect(next).toBeEnabled();
  await page.reload();
  await expect(next).toBeEnabled();
  await page.getByRole("button", { name: "重置进度", exact: true }).click();
  await page.getByRole("radio", { name: /重置整个实验/ }).check();
  await page.getByRole("button", { name: "确认重置" }).click();
  await expect(next).toBeDisabled();
  await page.reload();
  await expect(next).toBeDisabled();
  expect(requests).toEqual([]);
});

test("calculator runs and judges a circuit locally", async ({ page }) => {
  await page.goto("/labs/calculator");
  await page
    .getByRole("button", { name: "A 输出 out", exact: true })
    .click({ position: { x: 13, y: 8 } });
  await page.getByRole("button", { name: "Y 输入 in", exact: true }).click();
  await page.getByRole("button", { name: "运行公开测试", exact: true }).click();
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("computing-lab:project:v1:calculator") ?? "{}")
            .passedStages,
      ),
    )
    .toEqual([1]);
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("computing-lab:project:v1:calculator") ?? "{}")
            .passedStages,
      ),
    )
    .toEqual([1]);
});
