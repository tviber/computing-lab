import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`read a header, inspect a sample, and compare color distances at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(30_000);
    const errors: string[] = [];
    const mathAssets: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (/\/assets\/(?:MathFormula-|KaTeX_)/.test(path)) mathAssets.push(path);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const request = page.context().request;
    expect(
      (
        await request.post("/api/auth/login", {
          data: {
            studentNo: "admin",
            password: process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password",
          },
        })
      ).ok(),
    ).toBe(true);
    const { classes } = (await (await request.get("/api/admin/classes")).json()) as {
      classes: { id: string }[];
    };
    const labs = `classes/${classes[0].id}/labs`;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${labs}/decoding?stage=3`);
    const reader = page.getByRole("region", { name: "原始数据" });
    await reader.getByRole("button", { name: /^宽/ }).click();
    const table = reader.getByRole("table");
    const metrics = await table.evaluate((element) => {
      const cells = Array.from(element.querySelectorAll("td"), (cell) =>
        cell.getBoundingClientRect(),
      );
      const first = cells[0];
      return {
        widthSpread:
          Math.max(...cells.map((cell) => cell.width)) -
          Math.min(...cells.map((cell) => cell.width)),
        equalHeight: cells.every((cell) => cell.height === first.height),
        joined: cells.every(
          (cell, index) =>
            (index % 10 === 0 || cells[index - 1].right === cell.left) &&
            (index < 10 || cells[index - 10].bottom === cell.top),
        ),
        right: cells[9].right,
        marked: element.querySelectorAll(".is-field").length,
      };
    });
    expect(metrics).toMatchObject({ equalHeight: true, joined: true, marked: 4 });
    expect(metrics.widthSpread, "equal tracks, allowing subpixel layout rounding").toBeLessThan(
      0.25,
    );
    expect(metrics.right).toBeLessThanOrEqual(width);
    await reader.screenshot({ path: testInfo.outputPath("byte-reader.png") });
    await reader.getByRole("button", { name: /展开其余/ }).click();
    await expect(table.getByRole("cell").last()).toHaveAttribute("title", "data[245]");

    expect(mathAssets).toEqual([]);
    await reader.getByRole("button", { name: "试读图像高度" }).click();
    const practice = reader.getByRole("form", { name: "试读图像高度" });
    const source = practice.getByRole("radio", { name: /^从 #18 开始/ });
    await source.check();
    const height = practice.getByRole("textbox", { name: /图像高度/ });
    await height.fill("8");
    await height.press("Enter");
    await expect(practice.getByRole("status")).toContainText("选中了宽度字段");
    const beforeHeight = practice.getByRole("radio", { name: /^从 #21 开始/ });
    await beforeHeight.check();
    await beforeHeight.press("ArrowRight");
    await expect(practice.getByRole("radio", { name: /^从 #22 开始/ })).toBeChecked();
    await practice.getByRole("button", { name: "核对读数" }).click();
    await expect(practice.getByRole("status")).toContainText("还原 8 行像素");
    await expect(practice.locator(".katex-html")).toBeVisible();
    expect(mathAssets.some((path) => path.endsWith(".js"))).toBe(true);
    await expect(practice.locator("td.is-field")).toHaveCount(4);
    await reader.screenshot({ path: testInfo.outputPath("height-practice.png") });
    await reader.getByRole("button", { name: "返回字段导览" }).click();
    await expect(table.getByRole("cell").last()).toHaveAttribute("title", "data[245]");

    await page.goto(`${labs}/image-sampling?stage=1`);
    const receiver = page.getByRole("button", { name: /接收端看到的/ });
    await receiver.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "格子 (0, 0)" })).toContainText(
      "不到一半。内置规则发 0",
    );
    await receiver.press("ArrowRight");
    await expect(page.getByRole("status").filter({ hasText: "格子 (1, 0)" })).toBeVisible();
    await page
      .locator(".cell-inspector")
      .screenshot({ path: testInfo.outputPath("sample-cell.png") });

    await page.goto(`${labs}/color-quantization?stage=1`);
    const rack = page.getByRole("group", { name: "crimson 的候选色" });
    await rack.getByRole("button", { name: /black/ }).click();
    await expect(page.getByText("你选了 black，red 更近。")).toBeVisible();
    await page
      .locator(".quant-prediction")
      .screenshot({ path: testInfo.outputPath("color-distances.png") });
    await rack.getByRole("button", { name: /red/ }).click();
    await expect(page.getByText("猜中了，这是最短距离。")).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
