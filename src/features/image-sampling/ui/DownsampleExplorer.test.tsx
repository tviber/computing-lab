import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { cellStats } from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { IMAGE_SAMPLING_STAGES } from "../domain/stages.ts";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { runCellValue } from "./pyodideRunner.ts";

vi.mock("./pyodideRunner.ts", () => ({ runCellValue: vi.fn() }));

it("explains under, exactly and over half using the selected source region", () => {
  const stage = IMAGE_SAMPLING_STAGES[0];
  const image = publicGalleryFor(stage.category)[0].image;
  const width = 32;
  const cells = Array.from({ length: width * width }, (_, index) => {
    const cell = { cx: index % width, cy: Math.floor(index / width) };
    return { cell, ...cellStats(image, width, width, cell.cx, cell.cy) };
  });
  const [selectedCell, setSelectedCell] = createSignal<{ cx: number; cy: number } | null>(null);
  const props = {
    stage,
    width,
    height: width,
    resolutionReady: true,
    onResolution: vi.fn(),
    onCellPick: vi.fn(),
  };
  render(() => <DownsampleExplorer {...props} selectedCell={selectedCell()} />);
  for (const [sign, text, output] of [
    [-1, "不到一半", 0],
    [0, "刚好一半", 1],
    [1, "超过一半", 1],
  ] as const) {
    const { cell, on, total } = cells.find((item) => Math.sign(item.on * 2 - item.total) === sign)!;
    setSelectedCell(cell);
    flush();
    expect(screen.getByRole("status")).toHaveTextContent(
      `黑色占 ${on} / ${total}，${text}。内置规则发 ${output}。`,
    );
  }
});

it("distinguishes the student's grid from the built-in majority, even after a failed rerun", async () => {
  const stage = IMAGE_SAMPLING_STAGES[0];
  const [ruleCode, setRuleCode] = createSignal("def cell_value(region): return 1");
  const props = {
    stage,
    width: 8,
    height: 8,
    resolutionReady: true,
    onResolution: vi.fn(),
    onCellPick: vi.fn(),
    selectedCell: { cx: 0, cy: 0 },
  };
  vi.mocked(runCellValue)
    .mockResolvedValueOnce(Array(64).fill(1))
    .mockRejectedValueOnce(new Error("示例错误"));
  render(() => <DownsampleExplorer {...props} ruleCode={ruleCode()} />);
  fireEvent.click(screen.getByRole("button", { name: "我写的 cell_value" }));
  flush();
  await screen.findByText("你的规则发", { exact: false });
  expect(screen.getByRole("status")).toHaveTextContent("内置规则发 0。你的规则发 1。");
  setRuleCode("not valid");
  flush();
  expect(screen.queryByText("你的规则发", { exact: false })).toBeNull();
  expect(await screen.findByRole("alert")).toHaveTextContent("预览暂用内置规则");
  expect(screen.getByRole("status")).toHaveTextContent("内置规则发 0。");
});

describe("DownsampleExplorer share link", () => {
  it("does not render share button when shareSearch is not provided", () => {
    const stage = IMAGE_SAMPLING_STAGES[0];
    render(() => (
      <DownsampleExplorer
        height={8}
        onCellPick={vi.fn()}
        onResolution={vi.fn()}
        resolutionReady={true}
        selectedCell={null}
        stage={stage}
        width={8}
      />
    ));
    expect(screen.queryByText("复制实验链接")).not.toBeInTheDocument();
  });

  it("renders share button when shareSearch is provided", () => {
    const stage = IMAGE_SAMPLING_STAGES[0];
    render(() => (
      <DownsampleExplorer
        height={16}
        onCellPick={vi.fn()}
        onResolution={vi.fn()}
        resolutionReady={true}
        selectedCell={null}
        shareSearch={{ stage: 1, w: 16, h: 8 }}
        stage={stage}
        width={16}
      />
    ));
    expect(screen.getByRole("button", { name: /复制实验链接/ })).toBeInTheDocument();
  });
});
