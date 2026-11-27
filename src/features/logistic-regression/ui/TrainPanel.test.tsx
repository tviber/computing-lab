import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as logisticRegression from "../domain/logisticRegression.ts";
import type { TrainDraft } from "../domain/protocol.ts";
import { LOGISTIC_REGRESSION_STAGES } from "../domain/stages.ts";
import { TrainPanel } from "./TrainPanel.tsx";

describe("TrainPanel deferred parameter consistency", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows recalculating badge, disables submit, and binds ExperimentComparison to run params while deferred", () => {
    vi.useFakeTimers();
    const stage = LOGISTIC_REGRESSION_STAGES[3];

    function Harness() {
      const [draft, setDraft] = createSignal<TrainDraft>({
        eta: 0.1,
        epochs: 12,
        inspectEpoch: 12,
        showBgd: false,
      });
      return (
        <TrainPanel
          draft={draft()}
          hasNextStage
          onBonusStage={() => {}}
          onChange={setDraft}
          onNextStage={() => {}}
          onSubmit={() => {}}
          passed={false}
          result={null}
          stage={stage}
          submitting={false}
        />
      );
    }

    render(() => <Harness />);
    expect(screen.getByRole("button", { name: "提交第 4 关判定" })).toBeEnabled();

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "学习率预设" })).getByRole("radio", {
        name: "较大 η = 0.8",
      }),
    );
    flush();

    expect(screen.getByText("正在按新参数重新计算…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在重新计算…" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "记录当前结果作对照" }));
    flush();
    const comparison = screen.getByRole("table", { name: "已记录与当前的公开实验结果" });
    expect(within(comparison).getByRole("row", { name: /学习率/ })).toHaveTextContent("0.1");
    expect(within(comparison).getByRole("row", { name: /学习率/ })).not.toHaveTextContent("0.8");

    vi.runAllTimers();
    flush();
    expect(screen.queryByText(/正在按新参数重新计算/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交第 4 关判定" })).toBeEnabled();
  });

  it("reports accuracy and BCE baseline comparisons independently when accuracy beats 86% but BCE exceeds prior loss", () => {
    const stage = LOGISTIC_REGRESSION_STAGES[3];
    const realRun = logisticRegression.trainLogisticRegression({
      trainCount: logisticRegression.MAX_SAMPLE_SIZE,
      eta: 0.1,
      epochs: 12,
      threshold: 0.5,
      includeTrace: true,
      includeBgd: false,
    });
    const lastIdx = realRun.epochsHistory.length - 1;
    const tweakedHistory = realRun.epochsHistory.map((ep, idx) =>
      idx === lastIdx
        ? {
            ...ep,
            valLoss: 0.55,
            valMetrics: { ...ep.valMetrics, tp: 40, tn: 230, fp: 28, fn: 2, accuracy: 0.9 },
          }
        : ep,
    );
    vi.spyOn(logisticRegression, "trainLogisticRegression").mockReturnValueOnce({
      ...realRun,
      epochsHistory: tweakedHistory,
    });

    render(() => (
      <TrainPanel
        draft={{ eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false }}
        hasNextStage
        onBonusStage={() => {}}
        onChange={() => {}}
        onNextStage={() => {}}
        onSubmit={() => {}}
        passed={false}
        result={null}
        stage={stage}
        submitting={false}
      />
    ));

    const beforeAfter = screen.getByLabelText("训练前后验证短信表现对比");
    expect(within(beforeAfter).getByText(/分对 270 \/ 300 条（90\.0%）/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/准确率：已超过 86\.0% 多数类基线/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/高于训练集固定先验基线/)).toBeInTheDocument();
  });
});
