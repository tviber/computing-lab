import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("points right while closed and rotates down when expanded", async () => {
    const user = userEvent.setup();
    render(() => <Disclosure summary="提示">内容</Disclosure>);

    const trigger = screen.getByRole("button", { name: "提示" });
    const chevron = trigger.querySelector(".disclosure-chevron")!;
    expect(chevron).toHaveAttribute("data-open", "false");
    expect(chevron).toHaveAttribute("data-expand-direction", "down");
    expect(chevron.querySelector("path")?.getAttribute("d")).toBe("M9 18l6-6-6-6");

    await user.click(trigger);
    expect(chevron).toHaveAttribute("data-open", "true");
  });

  it("accepts per-disclosure color and size props", () => {
    render(() => (
      <Disclosure chevronColor="rgb(1, 2, 3)" chevronSize={18} summary="自定义">
        内容
      </Disclosure>
    ));

    const chevron = screen
      .getByRole("button", { name: "自定义" })
      .querySelector(".disclosure-chevron") as HTMLElement;
    expect(chevron.style.color).toBe("rgb(1, 2, 3)");
    expect(chevron.querySelector("svg")).toHaveAttribute("width", "18");
  });

  it("can point up when its content opens above the trigger", () => {
    render(() => (
      <Disclosure expandDirection="up" summary="上方内容">
        内容
      </Disclosure>
    ));

    expect(
      screen.getByRole("button", { name: "上方内容" }).querySelector(".disclosure-chevron"),
    ).toHaveAttribute("data-expand-direction", "up");
  });
});
