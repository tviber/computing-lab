import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { expect, it } from "vitest";
import { PRIORITY_TABLE_SIZE } from "../domain/priority.ts";
import type { LunchTestSummary } from "../domain/protocol.ts";
import { QUEUE_SCENARIO } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
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

function queueResult(): LunchTestSummary {
  const run = simulate(QUEUE_SCENARIO, {
    priority: new Array<number>(PRIORITY_TABLE_SIZE).fill(0),
  }).result;
  return {
    kind: "queue",
    onTime: run.onTime,
    total: run.orders.length,
    run,
    probes: [
      { id: "K1", title: "加急插队", passed: true, picked: 1, answer: 1 },
      { id: "K2", title: "等待更久的普通单", passed: false, picked: 0, answer: 1 },
    ],
  };
}

it("keeps both preset runs on one replay stage", () => {
  renderPanel();
  expect(screen.queryByText("预设：按到店顺序做")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "按到店顺序做" }));
  flush();
  expect(screen.getByText("预设：按到店顺序做")).toBeInTheDocument();
  expect(document.querySelectorAll(".lunch-replay")).toHaveLength(1);

  fireEvent.click(screen.getByRole("radio", { name: "有加急就先做" }));
  flush();
  expect(screen.getByText("预设：有加急就先做")).toBeInTheDocument();
  expect(document.querySelectorAll(".lunch-replay")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "暂停回放" }));
  flush();
});

it("shows the probe score in the my-rule replay title", () => {
  render(() => (
    <QueuePanel
      draft={{ code: "", priority: null }}
      onChange={() => {}}
      onSubmit={() => {}}
      passed={false}
      result={queueResult()}
      submitting={false}
    />
  ));

  fireEvent.click(screen.getByRole("radio", { name: "我的规则" }));
  flush();
  expect(screen.getByText("我的规则：这一轮回放 · 抽检 1 / 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "暂停回放" }));
  flush();
});
