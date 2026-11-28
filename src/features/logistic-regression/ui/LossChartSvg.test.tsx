import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { trainLogisticRegression } from "../domain/logisticRegression";
import { LossChartSvg } from "./LossChartSvg";

const history = trainLogisticRegression({
  trainCount: 48,
  eta: 0.1,
  epochs: 4,
  threshold: 0.5,
}).epochsHistory;

function harness() {
  const [points, setPoints] = createSignal(history);
  const [epoch, setEpoch] = createSignal(1);
  render(() => (
    <>
      <LossChartSvg history={points()} inspectEpoch={epoch()} onSelectEpoch={setEpoch} />
      <button>After chart</button>
    </>
  ));
  flush();
  const group = screen.getByRole("toolbar", { name: "损失曲线轮次" });
  const point = (epoch: number) =>
    within(group).getByRole("button", { name: new RegExp(`^查看第 ${epoch} 轮，`) });
  return { group, point, setPoints, setEpoch, epoch };
}

describe("loss chart epoch navigation", () => {
  it("uses one tab stop and supports arrows, Home, End, Enter and Space", () => {
    const { group, point, epoch } = harness();
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(point(1)).toHaveAttribute("tabindex", "0");
    point(1).focus();
    fireEvent.keyDown(point(1), { key: "ArrowRight" });
    flush();
    expect(point(2)).toHaveFocus();
    expect(epoch()).toBe(2);
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    fireEvent.keyDown(point(2), { key: "ArrowLeft" });
    flush();
    expect(point(1)).toHaveFocus();
    fireEvent.keyDown(point(1), { key: "End" });
    flush();
    expect(point(4)).toHaveFocus();
    fireEvent.keyDown(point(4), { key: "Home" });
    flush();
    expect(point(0)).toHaveFocus();
    expect(fireEvent.keyDown(point(0), { key: "ArrowLeft" })).toBe(true);
    point(3).focus();
    fireEvent.keyDown(point(3), { key: "Enter" });
    flush();
    expect(epoch()).toBe(3);
    point(2).focus();
    fireEvent.keyDown(point(2), { key: " " });
    expect(epoch()).toBe(3);
    fireEvent.keyUp(point(2), { key: " " });
    flush();
    expect(epoch()).toBe(2);
  });

  it("selects via the expanded hit area and follows external replay selection", () => {
    const { group, point, epoch, setEpoch } = harness();
    fireEvent.click(point(3).querySelector(".logistic-regression-epoch-hit-area")!);
    flush();
    expect(epoch()).toBe(3);
    expect(point(3)).toHaveFocus();
    screen.getByRole("button", { name: "After chart" }).focus();
    setEpoch(0);
    flush();
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(point(0)).toHaveAttribute("tabindex", "0");
  });

  it("keeps the focused node when losses change and recovers when history shortens", async () => {
    const { group, point, setPoints } = harness();
    const focused = point(4);
    focused.focus();
    setPoints(history.map((h) => ({ ...h, valLoss: h.valLoss / 2 })));
    flush();
    expect(point(4)).toBe(focused);
    expect(point(4)).toHaveFocus();
    setPoints(history.slice(0, 3));
    flush();
    await Promise.resolve();
    flush();
    expect(point(1)).toHaveFocus();
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    setPoints([]);
    flush();
    await Promise.resolve();
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
  });

  it("does not make a read-only curve keyboard interactive", () => {
    render(() => <LossChartSvg history={history} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
