import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HintDisclosure } from "./HintDisclosure";

describe("HintDisclosure", () => {
  it("opens and closes the hint with a single activation", async () => {
    const user = userEvent.setup();
    render(<HintDisclosure>先连接低位，再传递进位。</HintDisclosure>);

    const disclosure = screen.getByText("提示").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText("先连接低位，再传递进位。")).not.toBeVisible();

    await user.click(screen.getByText("提示"));
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText("先连接低位，再传递进位。")).toBeVisible();

    await user.click(screen.getByText("提示"));
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText("先连接低位，再传递进位。")).not.toBeVisible();
  });

  it("renders lab-supplied formatting instead of owning it", async () => {
    const user = userEvent.setup();
    render(
      <HintDisclosure>
        <abbr title="半加器">HalfAdder</abbr>
      </HintDisclosure>,
    );

    await user.click(screen.getByText("提示"));
    expect(screen.getByText("HalfAdder")).toHaveAttribute("title", "半加器");
  });
});
