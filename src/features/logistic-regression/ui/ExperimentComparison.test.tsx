import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { ExperimentComparison } from "./ExperimentComparison.tsx";

describe("ExperimentComparison", () => {
  it("keeps the recorded observations while live parameters and results change", () => {
    const first = {
      parameters: [
        { id: "samples", label: "训练样本量", value: 150, display: "150 条" },
        { id: "eta", label: "学习率", value: 0.1, display: "0.1" },
      ],
      metrics: [{ id: "loss", label: "验证损失", value: 0.42, display: "0.4200" }],
    };

    const [props, setProps] = createSignal(first);
    render(() => (
      <ExperimentComparison metrics={props().metrics} parameters={props().parameters} />
    ));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "记录当前结果作对照" }));
    flush();

    const next = {
      parameters: [
        { id: "samples", label: "训练样本量", value: 1400, display: "1,400 条" },
        first.parameters[1],
      ],
      metrics: [{ id: "loss", label: "验证损失", value: 0.1, display: "0.1000" }],
    };
    setProps(next);
    flush();

    expect(screen.getByRole("status")).toHaveTextContent("本次只改变了：训练样本量");
    const lossRow = screen.getByRole("row", { name: /验证损失/ });
    expect(
      within(lossRow)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["0.4200", "0.1000"]);

    setProps({
      ...next,
      parameters: [next.parameters[0], { ...next.parameters[1], value: 0.2, display: "0.2" }],
    });
    flush();

    expect(screen.getByRole("status")).toHaveTextContent("同时改变了：训练样本量、学习率");
    fireEvent.click(screen.getByRole("button", { name: "用当前结果更新记录" }));
    flush();
    expect(screen.getByRole("status")).toHaveTextContent("参数与记录相同");
    fireEvent.click(screen.getByRole("button", { name: "清除对照记录" }));
    flush();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
