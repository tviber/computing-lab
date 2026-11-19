import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";
import type { CircuitGraph } from "../domain/graph";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear?.();
  } catch {
    // Bun's test runtime may expose a read-only localStorage stub.
  }
});

describe("CalculatorLabPage autosave", () => {
  it("saves the edited stage after switching stages before the debounce expires", async () => {
    const saves: Array<{ stageIndex: number; graph: CircuitGraph }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        saves.push(JSON.parse(String(init.body)) as { stageIndex: number; graph: CircuitGraph });
      }
      const payload =
        init?.method === "PUT"
          ? null
          : { currentStage: 1, passedStages: [], unlockedSubmodules: [], drafts: {} };
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAt("/classes/c1/labs/calculator");
    await screen.findByRole("button", { name: /半加器/ });
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: /半加器/ }));
    fireEvent.click(screen.getByRole("button", { name: "AND" }));
    fireEvent.click(screen.getByRole("button", { name: /全加器/ }));

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    const stageTwoSave = saves.find((save) => save.stageIndex === 2);
    expect(stageTwoSave).toBeDefined();
    expect(stageTwoSave?.graph.nodes.some((node) => node.kind === "and")).toBe(true);
  });
});

describe("CalculatorLabPage coach", () => {
  it("opens with the signal lesson and pre-places an XOR for the first wire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 2,
              passedStages: [1],
              unlockedSubmodules: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    // The tour continues on stage 2 after the first-wire stage is passed.
    fireEvent.click(await screen.findByRole("button", { name: /半加器/ }));
    expect(await screen.findByText("先认识信号")).toBeInTheDocument();

    // Toggling A advances the tour to the "what 0/1 means" beat.
    fireEvent.click(screen.getByRole("button", { name: "切换 A，当前 0" }));
    expect(await screen.findByText("0 和 1")).toBeInTheDocument();

    // Past the ports beat the tour asks for the first wire — and the XOR the
    // learner needs is already on the canvas.
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.click(await screen.findByRole("button", { name: "继续" }));
    expect(await screen.findByText("第一根导线")).toBeInTheDocument();
    expect(await screen.findByText("XOR", { selector: ".node-label" })).toBeInTheDocument();
  });

  it("can reopen the guide after the learner skips it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 1,
              passedStages: [],
              unlockedSubmodules: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    expect(await screen.findByText("先认识信号")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "跳过引导" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看引导" }));

    expect(await screen.findByText("先认识信号")).toBeInTheDocument();
  });

  it("keeps tutorial progress isolated between stages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 2,
              passedStages: [1],
              unlockedSubmodules: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    expect(await screen.findByText("先认识信号")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "跳过引导" }));
    fireEvent.click(await screen.findByRole("button", { name: /半加器/ }));

    // Skipping stage 1 must not turn off the independent stage-2 guide.
    expect(await screen.findByText("先认识信号")).toBeInTheDocument();
  });
});

describe("CalculatorLabPage takeaway", () => {
  it("shows stage takeaway when the stage is passed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 2,
              passedStages: [1],
              unlockedSubmodules: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    expect(await screen.findByText(/本关收获：一根导线 = 实时信号传递/)).toBeInTheDocument();
  });

  it("does not show stage takeaway when the stage is not passed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 1,
              passedStages: [],
              unlockedSubmodules: [],
              drafts: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    await screen.findByText(/用一根导线把输入 A 连到输出 Y/);
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();
  });

  it("drops a pre-reset in-flight judge outcome and disables submit while resetting", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    let resolveJudge!: (value: Response) => void;
    let resolveReset!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/judge") && init?.method === "POST") {
          return new Promise<Response>((res) => {
            resolveJudge = res;
          });
        }
        if (url.includes("/reset") && init?.method === "POST") {
          return new Promise<Response>((res) => {
            resolveReset = res;
          });
        }
        if (url.includes("/project")) {
          return new Response(
            JSON.stringify({
              currentStage: 2,
              passedStages: [1],
              unlockedSubmodules: [],
              drafts: {},
              projectGeneration: 0,
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({}), {
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await renderAppAt("/classes/c1/labs/calculator");
    await screen.findByRole("button", { name: /半加器/ });

    // Start judge, then immediately trigger staff reset.
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    fireEvent.click(screen.getByRole("button", { name: "重置我的进度" }));
    expect(screen.getByRole("button", { name: /提交|判定中/ })).toBeDisabled();

    resolveReset(
      new Response(
        JSON.stringify({
          currentStage: 1,
          passedStages: [],
          unlockedSubmodules: [],
          drafts: {},
          projectGeneration: 1,
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await screen.findByText(/用一根导线把输入 A 连到输出 Y/);

    // Delayed judge returns passed=true from pre-reset — must be dropped cleanly.
    resolveJudge(
      new Response(
        JSON.stringify({
          score: 4,
          total: 4,
          passed: true,
          testSummary: { categories: {}, counterexample: null, error: null },
          submissionId: "stale-sub",
          passedStages: [1, 2],
          unlockedComponent: null,
          unlockedSubmodules: [],
          componentsRevision: 0,
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "提交结果" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();
  });
});
