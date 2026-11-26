import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as logisticRegression from "../domain/logisticRegression.ts";
import type { TrainDraft } from "../domain/protocol.ts";
import { LOGISTIC_REGRESSION_STAGES } from "../domain/stages.ts";
import { TrainPanel } from "./TrainPanel.tsx";

const deferredControl = vi.hoisted(() => ({ holdPrevious: false }));
const lastSettled = new Map<string, unknown>();

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  let callIndex = 0;
  return {
    ...actual,
    useDeferredValue<T>(value: T): T {
      const slot = actual.useRef<string | null>(null);
      if (slot.current === null) {
        slot.current = `slot-${callIndex++}`;
      }
      if (deferredControl.holdPrevious && lastSettled.has(slot.current)) {
        return lastSettled.get(slot.current) as T;
      }
      lastSettled.set(slot.current, value);
      return value;
    },
  };
});

describe("TrainPanel deferred parameter consistency", () => {
  afterEach(() => {
    deferredControl.holdPrevious = false;
    lastSettled.clear();
    vi.restoreAllMocks();
  });

  it("shows recalculating badge, disables submit, and binds ExperimentComparison to run params while deferred", () => {
    const stage = LOGISTIC_REGRESSION_STAGES[3];

    function Harness() {
      const [draft, setDraft] = useState<TrainDraft>({
        eta: 0.1,
        epochs: 12,
        inspectEpoch: 12,
        showBgd: false,
      });
      return (
        <TrainPanel
          draft={draft}
          hasNextStage
          onChange={setDraft}
          onNextStage={() => {}}
          onBonusStage={() => {}}
          onSubmit={() => {}}
          passed={false}
          result={null}
          stage={stage}
          submitting={false}
        />
      );
    }

    const { rerender } = render(<Harness />);
    expect(screen.getByRole("button", { name: "提交第 4 关判定" })).toBeEnabled();

    deferredControl.holdPrevious = true;
    fireEvent.click(screen.getByRole("button", { name: "较大 η = 0.8" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在按新参数重新计算");
    expect(screen.getByRole("button", { name: "正在重新计算…" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "记录当前结果作对照" }));
    const comparison = screen.getByRole("table", { name: "已记录与当前的公开实验结果" });
    expect(within(comparison).getByRole("row", { name: /学习率/ })).toHaveTextContent("0.1");
    expect(within(comparison).getByRole("row", { name: /学习率/ })).not.toHaveTextContent("0.8");

    deferredControl.holdPrevious = false;
    rerender(<Harness />);
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

    render(
      <TrainPanel
        draft={{ eta: 0.1, epochs: 12, inspectEpoch: 12, showBgd: false }}
        hasNextStage
        onChange={() => {}}
        onNextStage={() => {}}
        onBonusStage={() => {}}
        onSubmit={() => {}}
        passed={false}
        result={null}
        stage={stage}
        submitting={false}
      />,
    );

    const beforeAfter = screen.getByLabelText("训练前后验证短信表现对比");
    expect(within(beforeAfter).getByText(/分对 270 \/ 300 条（90\.0%）/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/准确率：已超过 86\.0% 多数类基线/)).toBeInTheDocument();
    expect(within(beforeAfter).getByText(/高于训练集固定先验基线/)).toBeInTheDocument();
  });
});
