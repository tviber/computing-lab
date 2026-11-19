import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDecode } from "../runtime/pyodideRunner.ts";
import { useDecodingLabController } from "./useDecodingLabController.ts";

vi.mock("../runtime/pyodideRunner.ts", () => ({
  BMP_HELPER: "def decode_bmp(data): return []",
  FILE_HELPERS: {},
  PythonRunError: class PythonRunError extends Error {},
  runDecode: vi.fn(),
  warmPyodide: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(runDecode).mockReset();
});

const context = { classId: "c1", ready: true, userId: "stu-1" };

const codesPayload = { kind: "codes", codes: [77, 79, 79, 78] };
const bitsPayload = { kind: "bits", groups: ["01001000", "01001001"] };
const bmpPayload = { kind: "bmp", bytes: [66, 77, 0, 0] };

function projectResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      currentStage: 1,
      passedStages: [1, 2],
      drafts: {},
      payloads: { "1": codesPayload, "2": bitsPayload, "3": bmpPayload },
      ...overrides,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function loaded() {
  const { result } = renderHook(() => useDecodingLabController(context));
  await waitFor(() => expect(result.current.model.payload).toEqual(codesPayload));
  return result;
}

describe("decoding controller", () => {
  it("refuses submit before a matching run and ignores locked stages", async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: unknown) => projectResponse());
    vi.stubGlobal("fetch", fetch);
    const result = await loaded();
    await act(async () => {
      await result.current.actions.submit();
    });
    expect(result.current.model.submission.blocker).toBe("概念题还没答完。");
    expect(fetch.mock.calls.filter((c) => String(c[0]).includes("/judge"))).toHaveLength(0);
    act(() => result.current.actions.selectStage(5));
    expect(result.current.model.stage?.index).toBe(1);
  });

  it("lets a decode result through, then drops it when the draft is edited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => projectResponse()),
    );
    vi.mocked(runDecode).mockResolvedValue("MOON");
    const result = await loaded();
    const stage = result.current.model.stage!;
    for (const prompt of stage.prompts ?? []) {
      act(() =>
        result.current.actions.answerPrompt(
          prompt.id,
          prompt.options.findIndex((o) => o.correct),
        ),
      );
    }
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    await waitFor(() => expect(result.current.model.output?.lastRun).toEqual({ text: "MOON" }));
    expect(result.current.model.submission.blocker).toBeNull();

    // Edit-after-run: code changed, so the stamped result no longer applies.
    act(() => result.current.actions.setFill("1", "chr(code+1)"));
    expect(result.current.model.output?.lastRun).toBeNull();
    expect(result.current.model.submission.blocker).toBe("先运行你的 decode，得到解码结果。");
  });

  it("drops an out-of-order run that resolves after the stage switched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => projectResponse()),
    );
    const slow = deferred<string>();
    vi.mocked(runDecode).mockReturnValue(slow.promise);
    const result = await loaded();
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    expect(result.current.model.editor?.running).toBe(true);

    // Fast stage switching while stage 1's run is still in flight.
    act(() => result.current.actions.selectStage(2));
    expect(result.current.model.editor?.running).toBe(false);
    act(() => result.current.actions.selectStage(3));
    await act(async () => {
      slow.resolve("STAGE-ONE-TEXT");
      await slow.promise;
    });

    expect(result.current.model.stage?.index).toBe(3);
    expect(result.current.model.editor?.running).toBe(false);
    expect(result.current.model.output?.lastRun).toBeNull();
    expect(result.current.model.output?.runError).toBeNull();
  });

  it("keeps the newer stage's running flag when the old run settles last", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => projectResponse()),
    );
    const slow1 = deferred<string>();
    const slow2 = deferred<string>();
    vi.mocked(runDecode).mockReturnValueOnce(slow1.promise).mockReturnValueOnce(slow2.promise);
    const result = await loaded();
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    act(() => result.current.actions.selectStage(2));

    // Stage 2 (bits) has its own template + payload: a fresh run owns running.
    act(() => result.current.actions.setFill("1", "chr(n)"));
    act(() => result.current.actions.run());
    expect(result.current.model.editor?.running).toBe(true);

    // The old stage-1 request may not clear stage 2's running indicator.
    await act(async () => {
      slow1.resolve("STALE");
      await slow1.promise;
    });
    expect(result.current.model.editor?.running).toBe(true);

    await act(async () => {
      slow2.resolve("OK");
      await slow2.promise;
    });
    expect(result.current.model.editor?.running).toBe(false);
    expect(result.current.model.output?.lastRun).toEqual({ text: "OK" });
  });

  it("drops a judge response that lands after the stage switched", async () => {
    const judge = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).includes("/judge") ? judge.promise : projectResponse(),
      ),
    );
    vi.mocked(runDecode).mockResolvedValue("MOON");
    const result = await loaded();
    const stage = result.current.model.stage!;
    for (const prompt of stage.prompts ?? []) {
      act(() =>
        result.current.actions.answerPrompt(
          prompt.id,
          prompt.options.findIndex((o) => o.correct),
        ),
      );
    }
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    await waitFor(() => expect(result.current.model.submission.blocker).toBeNull());

    let submit!: Promise<void>;
    act(() => {
      submit = result.current.actions.submit();
    });
    expect(result.current.model.submission.submitting).toBe(true);

    // The student moves on while the judge request is still in flight.
    act(() => result.current.actions.selectStage(2));
    expect(result.current.model.submission.submitting).toBe(false);

    await act(async () => {
      judge.resolve(
        new Response(
          JSON.stringify({
            passed: false,
            submissionId: "s1",
            currentStage: 1,
            passedStages: [1, 2],
            parts: [{ id: "artifact", label: "解码产物比对", ok: false, detail: "不符" }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
      await submit;
    });

    expect(result.current.model.stage?.index).toBe(2);
    expect(result.current.model.judge).toBeNull();
    expect(result.current.model.feedback.message).toBeNull();
  });

  it("drops a judge response that lands after the draft was edited", async () => {
    const judge = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).includes("/judge") ? judge.promise : projectResponse(),
      ),
    );
    vi.mocked(runDecode).mockResolvedValue("MOON");
    const result = await loaded();
    const stage = result.current.model.stage!;
    for (const prompt of stage.prompts ?? []) {
      act(() =>
        result.current.actions.answerPrompt(
          prompt.id,
          prompt.options.findIndex((o) => o.correct),
        ),
      );
    }
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    await waitFor(() => expect(result.current.model.submission.blocker).toBeNull());

    let submit!: Promise<void>;
    act(() => {
      submit = result.current.actions.submit();
    });
    expect(result.current.model.submission.submitting).toBe(true);

    // Edit while the judge request is in flight — its response describes
    // code that is no longer on screen.
    act(() => result.current.actions.setFill("1", "chr(code+1)"));

    await act(async () => {
      judge.resolve(
        new Response(
          JSON.stringify({
            passed: true,
            submissionId: "s1",
            currentStage: 2,
            passedStages: [1, 2],
            parts: [{ id: "artifact", label: "解码产物比对", ok: true, detail: "一致" }],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
      await submit;
    });

    expect(result.current.model.stage?.index).toBe(1);
    expect(result.current.model.judge).toBeNull();
    expect(result.current.model.submission.submitting).toBe(false);
    expect(result.current.model.feedback.message).toBeNull();
  });

  it("reports the friendly error for a failed run only while its input is current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => projectResponse()),
    );
    vi.mocked(runDecode).mockRejectedValue(new Error("SyntaxError: invalid syntax (line 5)"));
    const result = await loaded();
    act(() => result.current.actions.setFill("1", "chr("));
    act(() => result.current.actions.run());
    await waitFor(() => expect(result.current.model.output?.runError).toContain("第 5 行"));
    act(() => result.current.actions.setFill("1", "chr(code)"));
    expect(result.current.model.output?.runError).toBeNull();
  });

  it("allows staff free stage switching and resets project + transient runs", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(runDecode).mockResolvedValue("MOON");
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("/reset") && init?.method === "POST") {
        return projectResponse({ currentStage: 1, passedStages: [], drafts: {} });
      }
      return projectResponse({ currentStage: 2, passedStages: [1] });
    });
    vi.stubGlobal("fetch", fetch);

    const { result } = renderHook(() => useDecodingLabController({ ...context, staff: true }));
    await waitFor(() => expect(result.current.model.payload).toEqual(bitsPayload));
    expect(result.current.staffControls?.freeNavigation).toBe(true);

    // Stage 5 is accessible to staff even with passedStages = [1].
    act(() => result.current.actions.selectStage(5));
    expect(result.current.model.stage?.index).toBe(5);

    act(() => result.current.actions.selectStage(1));
    act(() => result.current.actions.setFill("1", "chr(code)"));
    act(() => result.current.actions.run());
    await waitFor(() => expect(result.current.model.output?.lastRun).toEqual({ text: "MOON" }));

    await act(async () => {
      await result.current.staffControls?.onReset?.();
    });

    expect(
      fetch.mock.calls.some(
        ([url, init]) => String(url).includes("/reset") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(result.current.model.stage?.index).toBe(1);
    expect(result.current.model.output?.lastRun).toBeNull();
  });
});
