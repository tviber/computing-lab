import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { FeaturedLabDeck } from "./FeaturedLabDeck";

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
    expect(screen.getAllByRole("figure")).toHaveLength(1);
    expect(screen.getByRole("figure")).toHaveTextContent("解码侦探");
  });
});
