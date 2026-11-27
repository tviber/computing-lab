import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { GuidedTonerTask } from "./GuidedTonerTask.tsx";
import { runNearestToner } from "./pyodideRunner.ts";

vi.mock("./pyodideRunner.ts", () => ({ runNearestToner: vi.fn() }));

it("lets students compare two actual distances, retry, and revisit a color", () => {
  render(() => <GuidedTonerTask code="" onCodeChange={vi.fn()} />);
  const rack = screen.getByRole("group", { name: "crimson 的候选色" });
  expect(within(rack).getAllByRole("button")).toHaveLength(9);
  fireEvent.click(within(rack).getByRole("button", { name: /black/ }));
  flush();
  expect(screen.getByText(/你选了 black，red 更近/)).toBeVisible();
  expect(screen.getByText("24464", { selector: ".katex-html .mord" })).toBeVisible();
  expect(screen.getByText("300", { selector: ".katex-html .mord" })).toBeVisible();
  fireEvent.click(within(rack).getByRole("button", { name: /red/ }));
  flush();
  expect(screen.getByText(/猜中了/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "navy" }));
  flush();
  expect(screen.queryByText(/猜中了/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "crimson" }));
  flush();
  expect(within(rack).getByRole("button", { name: /red/ })).toHaveAttribute("aria-pressed", "true");
});

it("checks all six colors with the student's code and drops obsolete results on edit", async () => {
  vi.mocked(runNearestToner).mockResolvedValueOnce([2, 2, 3, 5, 6, 7]);
  render(() => <GuidedTonerTask code="" onCodeChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/空 1/), { target: { value: "(b-toners[i][2])**2" } });
  const condition = screen.getByLabelText(/空 2/);
  fireEvent.change(condition, { target: { value: "d < best_d" } });
  flush();
  fireEvent.click(screen.getByRole("button", { name: "运行检查" }));
  const results = await screen.findByRole("list", { name: "六种源色的代码检查结果" });
  expect(within(results).getAllByRole("listitem")).toHaveLength(6);
  fireEvent.change(condition, { target: { value: "False" } });
  flush();
  expect(results).not.toBeInTheDocument();
});
