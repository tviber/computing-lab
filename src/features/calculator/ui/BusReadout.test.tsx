import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { getStage } from "../domain/stages";
import { BusReadout } from "./BusReadout";

describe("BusReadout", () => {
  it("renders each bus as an MSB-first number with a decimal reading", () => {
    // Stage 4 (求补码): A input bus, R signed output bus.
    const stage = getStage(5)!;
    render(() => (
      <BusReadout pins={{ A3: 0, A2: 1, A1: 0, A0: 1, R3: 1, R2: 0, R1: 1, R0: 0 }} stage={stage} />
    ));

    const input = screen.getByRole("listitem", { name: "A3，值 0" });
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "A0，值 1" })).toBeInTheDocument();

    // A = 0101 → 5; the bit cells sit MSB → LSB with a direction label,
    // preceded by the implied sign bit (0 for a positive operand).
    const cardA = screen.getByText("A", { selector: ".bus-card-head strong" }).closest("article")!;
    expect(cardA).toHaveTextContent("高位 → 低位");
    expect(cardA.querySelector(".bus-bits")!.textContent).toBe(
      "符号位" + "0" + "A3" + "0" + "A2" + "1" + "A1" + "0" + "A0" + "1",
    );
    expect(cardA).toHaveTextContent("无符号");
    expect(cardA).toHaveTextContent("5");
    expect(cardA).toHaveTextContent("-16×0 + 8×0 + 4×1 + 2×0 + 1×1 = 5");
  });

  it("shows unsigned and two's-complement readings for a signed bus", () => {
    const stage = getStage(5)!;
    render(() => (
      <BusReadout pins={{ A3: 0, A2: 1, A1: 0, A0: 1, R3: 1, R2: 0, R1: 1, R0: 1 }} stage={stage} />
    ));

    const cardR = screen.getByText("R", { selector: ".bus-card-head strong" }).closest("article")!;
    // A = 5 is nonzero so the implied sign is 1: R = 1011 → 无符号 11, 补码 -5.
    expect(cardR).toHaveTextContent("无符号");
    expect(cardR).toHaveTextContent("11");
    expect(cardR).toHaveTextContent("补码");
    expect(cardR).toHaveTextContent("-5");
    expect(cardR).toHaveTextContent("-16×1 + 8×1 + 4×0 + 2×1 + 1×1 = -5");
    expect(cardR.querySelector(".bus-bits")!.textContent).toContain("符号位1");
  });

  it("marks undriven pins with ? and the is-floating style", () => {
    const stage = getStage(2)!;
    render(() => <BusReadout pins={{ A: 1, B: 0, Sum: null, Carry: null }} stage={stage} />);

    const floating = screen.getByRole("listitem", { name: "Sum，值 ?" });
    expect(floating).toHaveClass("is-floating");
    expect(screen.getByRole("listitem", { name: "Carry，值 ?" })).toHaveClass("is-floating");
    // An incomplete bus shows no number.
    const card = screen
      .getByText("结果（2 位）", { selector: ".bus-card-head strong" })
      .closest("article")!;
    expect(card).toHaveTextContent("—");
  });
});
