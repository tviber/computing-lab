import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { expect, it } from "vitest";
import type { TrainingDraft } from "../domain/protocol.ts";
import type { TrainingOrder } from "../domain/scenarios.ts";
import { TrainingPanel } from "./TrainingPanel.tsx";

const training: TrainingOrder = {
  request: "请送到 5 号桌，一份牛肉面，少辣。我不赶时间，正常就好。",
  ticket: { item: "牛肉面", note: "少辣", table: "5", urgent: false },
};

const draft: TrainingDraft = {
  step: "deliver",
  ticket: training.ticket,
  kitchenChoice: "urgent",
  deliveredTable: null,
};

function renderPanel(overrides: Partial<TrainingDraft> = {}) {
  render(() => (
    <TrainingPanel
      draft={{ ...draft, ...overrides }}
      onChange={() => {}}
      onSubmit={() => {}}
      passed={false}
      submitting={false}
      training={training}
    />
  ));
}

it("swaps the four-tick cook comparison when the student asks for the other order", () => {
  renderPanel();
  expect(screen.getByText(/先做 · 要做 1 拍/)).toBeInTheDocument();
  expect(screen.getByText(/后做 · 要做 3 拍/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "看看换成另一种顺序" }));
  flush();

  expect(screen.getByText(/后做 · 要做 1 拍/)).toBeInTheDocument();
  expect(screen.getByText(/先做 · 要做 3 拍/)).toBeInTheDocument();
});

it("lets a wrong ticket through and names who follows the bad data", () => {
  renderPanel({ step: "cook", ticket: { ...training.ticket, table: "3" } });
  expect(screen.getByText("这张小票已经进厨房了")).toBeInTheDocument();
  expect(screen.getByText(/把餐端到 3 号桌/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "回前台改小票" })).toBeInTheDocument();
});
