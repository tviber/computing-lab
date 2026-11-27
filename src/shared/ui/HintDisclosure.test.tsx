import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HintDisclosure } from "./HintDisclosure";

describe("HintDisclosure", () => {
  it("opens and closes the hint with a single activation", async () => {
    const user = userEvent.setup();
    render(() => <HintDisclosure>先连接低位，再传递进位。</HintDisclosure>);

    const trigger = screen.getByRole("button", { name: "提示" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("先连接低位，再传递进位。")).not.toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("先连接低位，再传递进位。")).toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.getByText("先连接低位，再传递进位。")).not.toBeVisible());
  });

  it("renders lab-supplied formatting instead of owning it", async () => {
    const user = userEvent.setup();
    render(() => (
      <HintDisclosure>
        <abbr title="半加器">HalfAdder</abbr>
      </HintDisclosure>
    ));

    await user.click(screen.getByRole("button", { name: "提示" }));
    expect(screen.getByText("HalfAdder")).toHaveAttribute("title", "半加器");
  });
});
