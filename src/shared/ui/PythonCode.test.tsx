import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { PythonCodeWithBlanks, type PythonCodePart } from "./PythonCode";

function Example() {
  const [value, setValue] = useState("");
  const parts: PythonCodePart[] = [
    { kind: "code", code: "if " },
    {
      kind: "blank",
      id: "condition",
      value,
      ariaLabel: "条件",
      onChange: setValue,
    },
    { kind: "code", code: ":\n    return 1\n" },
  ];

  return <PythonCodeWithBlanks ariaLabel="示例代码" parts={parts} />;
}

it("highlights the surrounding code and the expression typed into a blank", () => {
  const { container } = render(<Example />);
  const input = screen.getByRole("textbox", { name: "条件" });

  expect(container.querySelector(".python-code .tok-keyword")).toHaveTextContent("if");

  fireEvent.change(input, { target: { value: "p >= 0.5" } });

  const blank = input.parentElement;
  expect(blank?.querySelector(".tok-variableName")).toHaveTextContent("p");
  expect(blank?.querySelector(".tok-number")).toHaveTextContent("0.5");
});
