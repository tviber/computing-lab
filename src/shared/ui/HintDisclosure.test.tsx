import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HintDisclosure } from "./HintDisclosure";

describe("HintDisclosure", () => {
  it("keeps the hint hidden until the learner confirms", async () => {
    const user = userEvent.setup();
    render(<HintDisclosure>先连接低位，再传递进位。</HintDisclosure>);

    expect(screen.getByRole("button", { name: "查看提示", expanded: false })).toBeInTheDocument();
    expect(screen.queryByText("先连接低位，再传递进位。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看提示" }));
    expect(screen.getByText("确定要看提示吗？")).toBeInTheDocument();
    expect(screen.queryByText("先连接低位，再传递进位。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确定查看" }));
    expect(screen.getByText("先连接低位，再传递进位。")).toBeInTheDocument();
  });

  it("can dismiss the confirmation and hide a revealed hint again", async () => {
    const user = userEvent.setup();
    render(<HintDisclosure>使用两个半加器级联。</HintDisclosure>);

    await user.click(screen.getByRole("button", { name: "查看提示" }));
    await user.click(screen.getByRole("button", { name: "暂时不看" }));
    expect(screen.getByRole("button", { name: "查看提示" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看提示" }));
    await user.click(screen.getByRole("button", { name: "确定查看" }));
    expect(screen.getByText("使用两个半加器级联。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "隐藏提示", expanded: true }));
    expect(screen.queryByText("使用两个半加器级联。")).not.toBeInTheDocument();
  });

  it("renders lab-supplied formatting instead of owning it", async () => {
    const user = userEvent.setup();
    render(
      <HintDisclosure>
        <abbr title="半加器">HalfAdder</abbr>
      </HintDisclosure>,
    );

    await user.click(screen.getByRole("button", { name: "查看提示" }));
    await user.click(screen.getByRole("button", { name: "确定查看" }));
    expect(screen.getByText("HalfAdder")).toHaveAttribute("title", "半加器");
  });
});
