import { fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";
import { halfAdderGraph } from "../domain/fixtures";
import type { CircuitGraph } from "../domain/graph";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear?.();
  } catch {}
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重置进度" })).not.toBeDisabled(),
    );
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: /半加器/ }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: "AND" }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: /全加器/ }));
    flush();

    vi.advanceTimersByTime(1500);
    flush();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    flush();

    const stageTwoSave = saves.find((save) => save.stageIndex === 2);
    expect(stageTwoSave).toBeDefined();
    expect(stageTwoSave?.graph.nodes.some((node) => node.kind === "and")).toBe(true);
  });
});

describe("CalculatorLabPage full-adder guide", () => {
  const halfAdder = { name: "HalfAdder", graph: halfAdderGraph() };
  it.each([
    { reason: "missing pass", passedStages: [1], unlockedSubmodules: [halfAdder] },
    { reason: "missing shelf component", passedStages: [1, 2], unlockedSubmodules: [] },
    {
      reason: "custom namesake",
      passedStages: [1, 2],
      unlockedSubmodules: [{ ...halfAdder, custom: true }],
    },
  ])(
    "skips the full-adder guide on direct entry with $reason",
    async ({ passedStages, unlockedSubmodules }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            currentStage: 2,
            passedStages,
            unlockedSubmodules,
            drafts: {},
          }),
        ),
      );
      await renderAppAt("/classes/c1/labs/calculator?stage=3");
      expect(await screen.findByRole("heading", { name: "实现ALU - 全加器" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "我知道了" })).toBeNull();
    },
  );

  it("lets the learner retry if saving the acknowledgement fails", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/guide/full-adder/acknowledge")) {
          attempts++;
          return attempts === 1
            ? Response.json({ error: "offline" }, { status: 503 })
            : Response.json({ ok: true });
        }
        return Response.json({
          currentStage: 3,
          passedStages: [1, 2],
          unlockedSubmodules: [halfAdder],
          drafts: {},
          fullAdderGuideAcknowledged: false,
        });
      }),
    );
    await renderAppAt("/classes/c1/labs/calculator?stage=3");
    fireEvent.click(await screen.findByRole("button", { name: "我知道了" }));
    expect(await screen.findByText(/确认未保存/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "用上你搭好的半加器" })).toBeNull(),
    );
    expect(attempts).toBe(2);
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

    expect(
      await screen.findByText(/本关收获：导线把输入直接送到输出，是数据通路的最小单元/),
    ).toBeInTheDocument();
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重置进度" })).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: "重置进度" }));
    flush();
    fireEvent.click(screen.getByRole("radio", { name: /重置整个实验/ }));
    flush();
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    flush();
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
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await screen.findByText(/用一根导线把输入 A 连到输出 Y/);
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();

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
    for (let i = 0; i < 6; i++) await Promise.resolve();
    flush();
    expect(screen.queryByRole("region", { name: "提交结果" })).not.toBeInTheDocument();
    expect(screen.queryByText(/本关收获/)).not.toBeInTheDocument();
  });
});
