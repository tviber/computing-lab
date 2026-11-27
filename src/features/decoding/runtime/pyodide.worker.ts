/**
 * Pyodide module worker — loads the Python runtime lazily and runs the
 * student decoder contract of this lab:
 *
 *   preamble? → student code → `result = call` (default `decode(data)`)
 *
 * `data` is the stage payload injected as a Python object; `preamble` injects
 * the provided helpers (decode_bmp / decode_as_text / decode_as_image) for
 * stages that hand the student ready-made decoders. Student code runs only
 * here, in the browser — the server never sees or executes it. Each run gets
 * a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { installPyodideWorker } from "../../../shared/worker/workerProtocol.ts";
import { assertPyCallable, withPyValue } from "../../../shared/lab/pyProxy.ts";

type RunRequest = {
  id: number;
  code: string;
  data: unknown;
  preamble?: string;
  call?: string;
  useCodeData?: boolean;
  captureStdout?: boolean;
};

async function runRequest(pyodide: PyodideInterface, request: RunRequest): Promise<unknown> {
  const globals = pyodide.toPy({});
  const stdout: string[] = [];
  if (request.captureStdout) {
    pyodide.setStdout({ batched: (text) => stdout.push(text) });
  }
  try {
    if (request.preamble?.trim()) {
      pyodide.runPython(request.preamble, { globals });
    }
    if (request.code.trim()) {
      pyodide.runPython(request.code, { globals });
    }
    if (!request.useCodeData) {
      withPyValue(pyodide.toPy(request.data), (data) => globals.set("data", data));
    }
    const call = request.call ?? "decode(data)";
    if (request.call === undefined) {
      assertPyCallable(globals, "decode", "decode(data)。data 是这一关交给你的数据。");
    }
    const out = pyodide.runPython(call, { globals }) as unknown;
    if (out !== null && typeof out === "object") {
      const proxy = out as {
        toJs?: (options?: unknown) => unknown;
        destroy?: () => void;
      };
      try {
        const result =
          typeof proxy.toJs === "function"
            ? proxy.toJs({ dict_converter: Object.fromEntries })
            : out;
        return request.captureStdout ? { result, stdout: stdout.join("") } : result;
      } finally {
        if (typeof proxy.destroy === "function") proxy.destroy();
      }
    }
    return request.captureStdout ? { result: out, stdout: stdout.join("") } : out;
  } finally {
    if (request.captureStdout) pyodide.setStdout();
    globals.destroy();
  }
}

installPyodideWorker<RunRequest>(async (pyodide, request) => ({
  result: await runRequest(pyodide, request),
}));
