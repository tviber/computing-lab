import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createComponent, createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import type { LabId } from "../../shared/lab/labMetadata";
import { FeaturedLabDeck } from "./FeaturedLabDeck";

const makeLabs = (...ids: [LabId, ...LabId[]]) => ids;

describe("featured lab deck", () => {
  it("keeps extra cards in the back and wraps spatial roles around the selected card", () => {
    const { container } = render(() => (
      <FeaturedLabDeck
        labs={["calculator", "image-sampling", "lunch-shift", "logistic-regression", "decoding"]}
      />
    ));
    const cards = () => Array.from(container.querySelectorAll(".featured-lab-card"));
    expect(cards().map((card) => card.getAttribute("data-role"))).toEqual([
      "active",
      "next",
      "back",
      "back",
      "prev",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "解码侦探" }));
    flush();
    expect(cards().map((card) => card.getAttribute("data-role"))).toEqual([
      "next",
      "back",
      "back",
      "prev",
      "active",
    ]);
    expect(screen.getByRole("group", { name: "实验示意" })).toBeVisible();
    expect(screen.getAllByRole("figure")).toHaveLength(1);
    expect(screen.getByRole("figure")).toHaveTextContent("解码侦探");
  });

  it("resets the selection when the provided lab list changes", () => {
    const initial = makeLabs("calculator", "image-sampling", "lunch-shift", "logistic-regression");
    const [labs, setLabs] = createSignal(initial);
    render(() =>
      createComponent(FeaturedLabDeck, {
        get labs() {
          return labs();
        },
      }),
    );
    flush();
    expect(screen.getByRole("figure")).toHaveTextContent("实现ALU");

    setLabs(
      makeLabs("decoding", "calculator", "image-sampling", "lunch-shift", "logistic-regression"),
    );
    flush();
    expect(screen.getByRole("figure")).toHaveTextContent("实现ALU");

    setLabs(makeLabs("decoding", "image-sampling", "lunch-shift", "logistic-regression"));
    flush();
    expect(screen.getByRole("figure")).toHaveTextContent("解码侦探");

    setLabs(
      makeLabs("decoding", "calculator", "image-sampling", "lunch-shift", "logistic-regression"),
    );
    flush();
    expect(screen.getByRole("figure")).toHaveTextContent("解码侦探");
  });
});
