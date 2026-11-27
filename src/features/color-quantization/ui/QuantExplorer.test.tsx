import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { COLOR_QUANT_STAGES } from "../domain/stages.ts";
import { QuantExplorer } from "./QuantExplorer.tsx";

describe("QuantExplorer share link", () => {
  it("does not render share button when shareSearch is not provided", () => {
    const stage = COLOR_QUANT_STAGES[0];
    render(() => (
      <QuantExplorer
        draft={{ toners: [], table: null, code: "" }}
        onTable={vi.fn()}
        onToners={vi.fn()}
        stage={stage}
      />
    ));
    expect(screen.queryByText("复制实验链接")).not.toBeInTheDocument();
  });

  it("renders share button when shareSearch is provided", () => {
    const stage = COLOR_QUANT_STAGES[0];
    render(() => (
      <QuantExplorer
        draft={{ toners: [0, 1], table: null, code: "" }}
        onTable={vi.fn()}
        onToners={vi.fn()}
        shareSearch={{ stage: 1, toners: "0,1" }}
        stage={stage}
      />
    ));
    expect(screen.getByRole("button", { name: /复制实验链接/ })).toBeInTheDocument();
  });
});
