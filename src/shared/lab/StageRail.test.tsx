import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { StageRail, type StageRailItem } from "./StageRail";

const STAGES: StageRailItem[] = [
  { index: 1, id: "s1", title: "第一关" },
  { index: 2, id: "s2", title: "第二关" },
  { index: 3, id: "opt1", title: "梯度维修台", optional: true },
];

describe("StageRail", () => {
  it("groups optional stages under a collapsible 选做挑战 disclosure without inline 附加关 tags", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const [stageIndex, setStageIndex] = createSignal(1);
    const { container } = render(() => (
      <StageRail
        label="逻辑回归"
        onSelect={onSelect}
        passedStages={[1, 2]}
        stageIndex={stageIndex()}
        stages={STAGES}
        unlocked={() => true}
      />
    ));

    expect(container.textContent).not.toContain("附加关");
    const trigger = container.querySelector(".stage-branch-summary")!;
    expect(trigger).toHaveTextContent("选做挑战");
    expect(trigger).toHaveTextContent("0 / 1");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const optionalButton = screen.getByRole("button", { name: "梯度维修台" });
    expect(optionalButton.className).toContain("is-optional");
    await user.click(optionalButton);
    expect(onSelect).toHaveBeenCalledWith(3);

    setStageIndex(3);
    flush();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
