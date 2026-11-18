import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabPageShell } from "./LabPageShell";

beforeEach(() => localStorage.clear());

function renderShell(extra?: { collapsedLabel?: string; forceExpand?: boolean; labId?: string }) {
  return render(
    <LabPageShell
      collapsedLabel={extra?.collapsedLabel}
      forceExpand={extra?.forceExpand}
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

    await user.click(toggle);
    expect(grid.className).toContain("is-collapsed");
    expect(screen.getByRole("button", { name: "展开关卡栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The rail subtree stays mounted — only the scroll area is hidden via CSS.
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

    // Another lab has its own key and is unaffected.
    const other = renderShell({ labId: "ml-intro" });
    expect(other.container.querySelector(".lab-page-grid")!.className).not.toContain(
      "is-collapsed",
    );
  });

  it("shows the collapsed label and forceExpand keeps the rail open", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <LabPageShell collapsedLabel="第 3 关" labId="ml-intro" rail={<nav>关卡列表</nav>}>
        <main>工作区</main>
      </LabPageShell>,
    );
    await user.click(screen.getByRole("button", { name: "收起关卡栏" }));
    expect(screen.getByText("第 3 关")).toBeInTheDocument();

    rerender(
      <LabPageShell
        collapsedLabel="第 3 关"
        forceExpand
        labId="ml-intro"
        rail={<nav>关卡列表</nav>}
      >
        <main>工作区</main>
      </LabPageShell>,
    );
    const grid = container.querySelector(".lab-page-grid")!;
    expect(grid.className).not.toContain("is-collapsed");
    expect(grid.className).toContain("is-forced");
    // While forced open the toggle is disabled — clicking it would silently
    // rewrite the stored preference without any visible effect.
    const forcedToggle = screen.getByRole("button", { name: "收起关卡栏" });
    expect(forcedToggle).toHaveAttribute("aria-expanded", "true");
    expect(forcedToggle).toBeDisabled();

    await user.click(forcedToggle);
    expect(localStorage.getItem("computing-lab:lab-rail:ml-intro")).toBe("1");
  });

  it("renders staff controls only when provided and gates reset behind confirm", async () => {
    const user = userEvent.setup();
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const onReset = vi.fn();

    const { rerender } = renderShell();
    expect(screen.queryByText("教师视角 · 自由切关")).toBeNull();
    expect(screen.queryByRole("button", { name: "重置我的进度" })).toBeNull();

    rerender(
      <LabPageShell
        labId="decoding"
        rail={<nav>关卡列表</nav>}
        staffControls={{ freeNavigation: true, onReset }}
      >
        <main>工作区</main>
      </LabPageShell>,
    );

    expect(screen.getByText("教师视角 · 自由切关")).toBeInTheDocument();
    const resetBtn = screen.getByRole("button", { name: "重置我的进度" });
    await user.click(resetBtn);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();

    confirmMock.mockReturnValueOnce(true);
    await user.click(resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);

    rerender(
      <LabPageShell
        labId="decoding"
        rail={<nav>关卡列表</nav>}
        staffControls={{
          freeNavigation: true,
          onReset,
          resetting: true,
          resetError: "重置失败",
        }}
      >
        <main>工作区</main>
      </LabPageShell>,
    );
    expect(screen.getByRole("button", { name: "重置中…" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("重置失败");
    vi.unstubAllGlobals();
  });
});
