import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecodingWorkspace } from "../ui/DecodingWorkspace.tsx";
import { createDecodingPreviewActions, decodingPreviewFixtures } from "./fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

const scene = (id: string) => decodingPreviewFixtures.find((f) => f.id === id)!.model;

describe("decoding fixed presentation scenes", () => {
  it.each(decodingPreviewFixtures)(
    "renders $id with no auth, network or controller",
    ({ model }) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      render(() => (
        <DecodingWorkspace actions={createDecodingPreviewActions(vi.fn())} model={model} />
      ));
      expect(screen.getByRole("main", { name: "解码实验区" })).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("records intents instead of starting workers or saving", () => {
    const record = vi.fn();
    render(() => (
      <DecodingWorkspace actions={createDecodingPreviewActions(record)} model={scene("initial")} />
    ));
    fireEvent.click(screen.getByRole("button", { name: "运行 decode" }));
    expect(record).toHaveBeenCalledWith("run");
    expect(screen.getByRole("main", { name: "解码实验区" })).toBeInTheDocument();
  });

  it("gates submit on the same blockers the lab uses", () => {
    expect(scene("initial").submission.blocker).toBe("概念题还没答完。");
    expect(scene("incomplete-cloze").submission.blocker).toBe("还有空没填上——每个空都要填。");
    expect(scene("decoded").submission.blocker).toBeNull();
    expect(scene("files-stage").submission.blocker).toBe("每个文件都要先给出判定。");
  });
});
