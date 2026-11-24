import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabPageShell } from "./LabPageShell";

beforeEach(() => localStorage.clear());

function renderShell(extra?: { collapsedLabel?: string; labId?: string }) {
  return render(
    <LabPageShell
      collapsedLabel={extra?.collapsedLabel}
      labId={extra?.labId ?? "decoding"}
      rail={<nav>关卡列表</nav>}
    >
      <main>工作区</main>
    </LabPageShell>,
  );
}

describe("LabPageShell", () => {
  it("renders the rail expanded by default and collapses on toggle", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    const grid = container.querySelector(".lab-page-grid")!;
    expect(grid.className).not.toContain("is-collapsed");
    expect(screen.getByText("关卡列表")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "收起关卡栏" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.querySelector("svg path")?.getAttribute("d")).toContain("m10-12-3 3 3 3");

    await user.click(toggle);
    expect(grid.className).toContain("is-collapsed");
    expect(screen.getByRole("button", { name: "展开关卡栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(toggle.querySelector("svg path")?.getAttribute("d")).toContain("m6-12 3 3-3 3");
    expect(screen.getByText("关卡列表")).toBeInTheDocument();
  });

  it("persists the collapsed state under the lab-scoped key and restores it", async () => {
    const user = userEvent.setup();
    const first = renderShell({ labId: "decoding" });
    await user.click(screen.getByRole("button", { name: "收起关卡栏" }));
    expect(localStorage.getItem("computing-lab:lab-rail:decoding")).toBe("1");
    first.unmount();

    const second = render(
      <LabPageShell labId="decoding" rail={<nav>关卡列表</nav>}>
        <main>工作区</main>
      </LabPageShell>,
    );
    expect(second.container.querySelector(".lab-page-grid")!.className).toContain("is-collapsed");
    second.unmount();

    const other = renderShell({ labId: "logistic-regression" });
    expect(other.container.querySelector(".lab-page-grid")!.className).not.toContain(
      "is-collapsed",
    );
  });

  it("shows the collapsed label", async () => {
    const user = userEvent.setup();
    render(
      <LabPageShell collapsedLabel="第 3 关" labId="logistic-regression" rail={<nav>关卡列表</nav>}>
        <main>工作区</main>
      </LabPageShell>,
    );
    await user.click(screen.getByRole("button", { name: "收起关卡栏" }));
    expect(screen.getByText("第 3 关")).toBeInTheDocument();
  });

  it("confirms scoped resets and omits the controls from read-only workspaces", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn(async () => true);

    const { rerender } = renderShell();
    expect(screen.queryByRole("button", { name: "重置进度" })).toBeNull();

    rerender(
      <LabPageShell
        labId="decoding"
        rail={<nav>关卡列表</nav>}
        resetControls={{
          stageIndex: 3,
          canReset: true,
          resetting: false,
          resetError: null,
          onReset,
        }}
      >
        <main>工作区</main>
      </LabPageShell>,
    );

    const resetBtn = screen.getByRole("button", { name: "重置进度" });
    await user.click(resetBtn);
    expect(screen.getByRole("dialog", { name: "重置实验进度" })).toBeInTheDocument();
    expect(screen.getByText("清除本关及依赖它的后续关卡记录，保留不受影响的关卡。")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onReset).not.toHaveBeenCalled();

    await user.click(resetBtn);
    await user.click(screen.getByRole("button", { name: "确认重置" }));
    expect(onReset).toHaveBeenLastCalledWith({ scope: "stage", stageIndex: 3 });

    await user.click(resetBtn);
    await user.click(screen.getByRole("radio", { name: /重置整个实验/ }));
    await user.click(screen.getByRole("button", { name: "确认重置" }));
    expect(onReset).toHaveBeenLastCalledWith({ scope: "lab" });
  });
});
