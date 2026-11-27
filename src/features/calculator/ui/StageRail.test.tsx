import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentDef } from "../domain/graph";
import { StageRail } from "./StageRail";

afterEach(() => vi.unstubAllGlobals());

describe("StageRail custom components", () => {
  it("confirms and delegates deletion of a custom component", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const custom: ComponentDef = {
      name: "PartialProduct",
      custom: true,
      graph: { nodes: [], edges: [] },
    };

    render(() => (
      <StageRail
        onDeleteCustomComponent={onDelete}
        onEditCustomComponent={onEdit}
        onPlaceComponent={vi.fn()}
        onSelectStage={vi.fn()}
        passedStages={[]}
        stageIndex={1}
        unlockedSubmodules={[custom]}
      />
    ));

    await user.click(screen.getByRole("button", { name: "删除自定义组件 PartialProduct" }));
    expect(window.confirm).toHaveBeenCalledWith("确定删除自定义组件“PartialProduct”吗？");
    expect(onDelete).toHaveBeenCalledWith("PartialProduct");

    await user.click(screen.getByRole("button", { name: "编辑自定义组件 PartialProduct" }));
    expect(onEdit).toHaveBeenCalledWith("PartialProduct");
  });

  it("inserts optional challenges after their anchors and unlocks them locally", () => {
    const [passedStages, setPassedStages] = createSignal<number[]>([]);
    const [stageIndex, setStageIndex] = createSignal(1);
    const { container } = render(() => (
      <StageRail
        onDeleteCustomComponent={vi.fn()}
        onEditCustomComponent={vi.fn()}
        onPlaceComponent={vi.fn()}
        onSelectStage={vi.fn()}
        passedStages={passedStages()}
        stageIndex={stageIndex()}
        unlockedSubmodules={[]}
      />
    ));

    const branches = container.querySelectorAll("details.stage-branch");
    expect(branches).toHaveLength(3);
    expect(branches[0]).not.toHaveAttribute("open");
    expect(branches[1]).not.toHaveAttribute("open");
    expect(branches[2]).not.toHaveAttribute("open");

    const exactCase = branches[0].querySelector("button")!;
    expect(exactCase).toBeDisabled();
    expect(exactCase.className).toContain("is-optional");
    expect(branches[2].querySelector("button")).toBeDisabled();
    expect(screen.getByText("0 / 6 主线")).toBeInTheDocument();

    setPassedStages([1]);
    flush();
    expect(branches[0].querySelector("button")).not.toBeDisabled();
    expect(branches[1].querySelectorAll("button")[0]).toBeDisabled();
    expect(branches[1].querySelectorAll("button")[1]).toBeDisabled();
    expect(screen.getByText("1 / 6 主线")).toBeInTheDocument();

    setStageIndex(9);
    flush();
    expect(branches[0]).toHaveAttribute("open");
  });
});
