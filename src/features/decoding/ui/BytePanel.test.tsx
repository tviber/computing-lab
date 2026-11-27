import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { expect, it } from "vitest";
import { encodeBmp, type PixelMatrix } from "../domain/bmp.ts";
import { BytePanel } from "./BytePanel.tsx";
import { SampleBytes } from "./SampleBytes.tsx";

const pixels: PixelMatrix = [
  Array.from({ length: 4 }, () => [11, 12, 13]),
  Array.from({ length: 4 }, () => [21, 22, 23]),
];
const bytes = encodeBmp(pixels);

it("locates a four-byte field across rows without inserting labels or losing the tail", () => {
  render(() => <BytePanel payload={{ kind: "bmp", bytes, width: 4, height: 2 }} />);
  const table = screen.getByRole("table", { name: /BMP 字节/ });
  const visibleBytes = () =>
    within(table)
      .getAllByRole("cell")
      .map((cell) => Number(cell.textContent));
  expect(visibleBytes()).toEqual(bytes.slice(0, 60));
  fireEvent.click(screen.getByRole("button", { name: /^宽/ }));
  flush();
  expect(screen.getByRole("button", { name: /^宽/ })).toHaveAttribute("aria-pressed", "true");
  expect(
    [...table.querySelectorAll(".is-field")].map((cell) => cell.getAttribute("title")),
  ).toEqual(["data[18]", "data[19]", "data[20]", "data[21]"]);
  fireEvent.click(screen.getByRole("button", { name: /展开其余/ }));
  flush();
  expect(visibleBytes()).toEqual(bytes);
  fireEvent.click(screen.getByRole("button", { name: /收起后续/ }));
  flush();
  expect(visibleBytes()).toEqual(bytes.slice(0, 60));
});

it("shows the sample's bottom row first and its BGR channels without changing raw input", () => {
  const [samplePixels, setSamplePixels] = createSignal<PixelMatrix | null>(pixels);
  const [raw, setRaw] = createSignal(JSON.stringify(bytes));
  render(() => <SampleBytes pixels={samplePixels()} raw={raw()} />);
  const blue = screen.getByRole("rowheader", { name: "B" }).closest("tr")!;
  expect(within(blue).getAllByRole("cell")[0]).toHaveTextContent("23");
  fireEvent.change(screen.getByLabelText("按文件顺序查看像素行"), { target: { value: "1" } });
  flush();
  expect(within(blue).getAllByRole("cell")[0]).toHaveTextContent("13");
  setSamplePixels(null);
  setRaw("不是字节列表");
  flush();
  expect(screen.getByText("不是字节列表")).toBeVisible();
});

it("lets the learner retry a field and a number independently, then return to the original view", async () => {
  render(() => (
    <BytePanel allowHeightPractice payload={{ kind: "bmp", bytes, width: 4, height: 2 }} />
  ));
  fireEvent.click(screen.getByRole("button", { name: /^宽/ }));
  fireEvent.click(screen.getByRole("button", { name: /展开其余/ }));
  fireEvent.click(screen.getByRole("button", { name: "试读图像高度" }));
  flush();
  expect(screen.queryByRole("button", { name: /^高 #/ })).toBeNull();
  const practice = await screen.findByRole("form", { name: "试读图像高度" });
  const feedback = within(practice).getByRole("status");
  const count = screen.getByRole("textbox", { name: /图像高度/ });
  const check = screen.getByRole("button", { name: "核对读数" });
  expect(feedback).toBeEmptyDOMElement();
  fireEvent.click(check);
  flush();
  expect(feedback).toHaveTextContent(/先在表里点选/);
  fireEvent.click(screen.getByRole("radio", { name: /^从 #18 开始/ }));
  fireEvent.click(check);
  flush();
  expect(feedback).toHaveTextContent(/选中了宽度字段/);
  fireEvent.click(screen.getByRole("radio", { name: /^从 #22 开始/ }));
  flush();
  expect(feedback).toBeEmptyDOMElement();
  fireEvent.click(check);
  flush();
  expect(count).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(count, { target: { value: "4" } });
  flush();
  expect(count).toHaveAttribute("aria-invalid", "false");
  fireEvent.click(check);
  flush();
  expect(feedback).toHaveTextContent(/位置找对了/);
  fireEvent.change(count, { target: { value: "2" } });
  fireEvent.click(check);
  flush();
  expect(feedback).toHaveTextContent(/还原 2 行像素/);
  fireEvent.click(screen.getByRole("button", { name: "返回字段导览" }));
  flush();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByRole("button", { name: /^宽/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /收起后续/ })).toBeVisible();
});

it("only works through the first binary group on request", () => {
  render(() => <BytePanel payload={{ kind: "bits", groups: ["01001000", "01001001"] }} />);
  const clue = screen.getByText(/64 \+ 8 = 72/);
  expect(clue).not.toBeVisible();
  fireEvent.click(screen.getByText("试读第一组"));
  expect(clue).toBeVisible();
});
