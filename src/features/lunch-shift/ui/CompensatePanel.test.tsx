import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { expect, it } from "vitest";
import { CompensatePanel } from "./CompensatePanel.tsx";

function renderPanel() {
  render(() => (
    <CompensatePanel
      draft={{ code: "", compensate: null }}
      onChange={() => {}}
      onSubmit={() => {}}
      result={null}
      submitted={false}
      submitting={false}
    />
  ));
}

it("hides the no-op delta and explains a refund in plain words", () => {
  renderPanel();
  expect(screen.queryByText(/比不补偿/)).not.toBeInTheDocument();

  const card = screen.getByRole("radiogroup", { name: "R12 的补偿选择" });
  fireEvent.click(within(card).getByRole("radio", { name: "退款" }));
  flush();

  expect(screen.getByText("比不补偿：少 0.55 单差评，多花 6 元")).toBeInTheDocument();
});
