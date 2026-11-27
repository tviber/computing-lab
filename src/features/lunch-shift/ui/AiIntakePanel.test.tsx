import { render, screen } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { AiIntakePanel, type AiIntakePanelProps } from "./AiIntakePanel.tsx";
import type { AiIntakeFinalProps } from "./AiIntakeFinalPanel.tsx";
import type { AiIntakePracticeProps } from "./AiIntakePracticePanel.tsx";

vi.mock("./AiIntakeFinalPanel.tsx", () => ({
  AiIntakeFinalPanel: (props: AiIntakeFinalProps) => (
    <div data-testid="final-panel">{props.draft.queueCode}</div>
  ),
}));

vi.mock("./AiIntakePracticePanel.tsx", () => ({
  AiIntakePracticePanel: (props: AiIntakePracticeProps) => (
    <div data-testid="practice-panel">{props.draft.confirmCode}</div>
  ),
}));

const handlers = {
  onChange: () => {},
  onSubmit: () => {},
  orders: [],
  result: null,
  submitting: false,
};

const practice: AiIntakePanelProps = {
  ...handlers,
  variant: "practice",
  draft: { confirmCode: "practice", results: null },
};

const final: AiIntakePanelProps = {
  ...handlers,
  variant: "final",
  draft: { confirmCode: "final", results: null, queueCode: "queue", priority: null },
};

it("switches panels when the variant prop changes", () => {
  const [panelProps, setPanelProps] = createSignal<AiIntakePanelProps>(practice);
  render(() => <AiIntakePanel {...panelProps()} />);

  expect(screen.getByTestId("practice-panel")).toHaveTextContent("practice");
  expect(screen.queryByTestId("final-panel")).not.toBeInTheDocument();

  setPanelProps(final);
  flush();

  expect(screen.getByTestId("final-panel")).toHaveTextContent("queue");
  expect(screen.queryByTestId("practice-panel")).not.toBeInTheDocument();
});
