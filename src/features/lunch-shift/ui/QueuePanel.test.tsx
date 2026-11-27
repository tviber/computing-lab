import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { expect, it } from "vitest";
import { QueuePanel } from "./QueuePanel.tsx";

function renderPanel() {
  render(() => (
    <QueuePanel
      draft={{ code: "", priority: null }}
      onChange={() => {}}
      onSubmit={() => {}}
      passed={false}
      result={null}
      submitting={false}
    />
  ));
}

it("keeps both preset runs on one replay stage", () => {
  renderPanel();
  expect(screen.queryByText("预设：按到店顺序做")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "按到店顺序做" }));
  flush();
  expect(screen.getByText("预设：按到店顺序做")).toBeInTheDocument();
  expect(document.querySelectorAll(".lunch-replay")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "有加急就先做" }));
  flush();
  expect(screen.getByText("预设：有加急就先做")).toBeInTheDocument();
  expect(document.querySelectorAll(".lunch-replay")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "暂停回放" }));
  flush();
});
