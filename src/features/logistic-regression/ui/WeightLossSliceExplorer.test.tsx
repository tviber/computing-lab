import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import type { TrainedModel } from "../domain/logisticRegression.ts";
import { WeightLossSliceExplorer } from "./WeightLossSliceExplorer.tsx";

function model(bias: number): TrainedModel {
  return {
    vocab: ["免费"],
    vocabSet: new Set(["免费"]),
    wordToIndex: new Map([["免费", 0]]),
    docFreq: new Int32Array([14]),
    weights: new Float64Array([0]),
    bias,
    weightsByWord: new Map([["免费", 0]]),
  };
}

describe("slice context changes", () => {
  it("expires trained-model history when the model is replaced, but preserves zero-context history", () => {
    const [trainedModel, setTrainedModel] = createSignal(model(0));
    render(() => <WeightLossSliceExplorer trainedModel={trainedModel()} />);
    const step = () => {
      fireEvent.click(screen.getByRole("button", { name: "按梯度更新一步" }));
      flush();
    };
    step();
    expect(screen.getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();
    setTrainedModel(model(1));
    flush();
    expect(screen.getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "选择其余权重基准" })).getByRole("radio", {
        name: /当前训练模型/,
      }),
    );
    flush();
    expect(screen.queryByRole("list", { name: /跳跃历史轨迹/ })).not.toBeInTheDocument();
    step();
    expect(screen.getByRole("list", { name: /跳跃历史轨迹/ })).toBeInTheDocument();
    setTrainedModel(model(-1));
    flush();
    expect(screen.queryByRole("list", { name: /跳跃历史轨迹/ })).not.toBeInTheDocument();
    step();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
