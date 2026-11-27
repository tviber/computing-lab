import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { AnnotatedText } from "./CalculatorTerms";

describe("calculator term annotations", () => {
  it("explains technical labels without changing their visible spelling", () => {
    render(() => <AnnotatedText text="Sum = XOR，Carry = AND" />);

    expect(screen.getByText("Sum")).toHaveAttribute("title", expect.stringContaining("和位"));
    expect(screen.getByText("Carry")).toHaveAttribute("title", expect.stringContaining("进位"));
    expect(screen.getByText("XOR")).toHaveAttribute("title", expect.stringContaining("异或门"));
  });
});
