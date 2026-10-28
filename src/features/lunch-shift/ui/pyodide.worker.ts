/**
 * Pyodide module worker for the lunch-shift lab — runs student Python only
 * in the browser; the server never sees or executes it.
 *
 *   kind "tables":   run the word-table code, read back the four variables
 *                    (dish_words / note_words / calm_words / rush_words) as
 *                    plain JSON — dicts become [key, value] pairs in
 *                    insertion order.
 *   kind "priority": run the priority code, then evaluate
 *                    priority(urgent, wait, cook) for every one of the
 *                    2×31×2 = 124 input combinations → a flat value table.
 *
 * Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { installPyodideWorker } from "../../../shared/worker/workerProtocol.ts";

type RunRequest =
  { id: number; kind: "tables"; code: string } | { id: number; kind: "priority"; code: string };

const TABLES_CALL = `[
  list(dish_words.items()) if isinstance(dish_words, dict) else dish_words,
  list(note_words.items()) if isinstance(note_words, dict) else note_words,
  list(calm_words),
  list(rush_words),
]`;

const PRIORITY_CALL = `[priority(u, w, c) for u in (False, True) for w in range(31) for c in (1, 3)]`;

function mustFn(globals: ReturnType<PyodideInterface["toPy"]>, name: string, sig: string) {
  const fn = globals.get(name);
  if (fn === undefined || typeof fn.callKwargs !== "function") {
    throw new Error(`需要一个函数 ${sig}`);
  }
}

async function runRequest(pyodide: PyodideInterface, request: RunRequest): Promise<object> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(request.code, { globals });
    if (request.kind === "priority") {
      mustFn(globals, "priority", "priority(urgent, wait, cook)");
    }
    const out = pyodide.runPython(request.kind === "tables" ? TABLES_CALL : PRIORITY_CALL, {
      globals,
    });
    try {
      const result = out.toJs() as unknown;
      if (request.kind === "priority" && Array.isArray(result)) {
        // None → name the exact case instead of a table-index error later;
        // True/False are perfectly good priorities → 1/0.
        return {
          result: result.map((value, index) => {
            if (typeof value === "boolean") return value ? 1 : 0;
            if (value === undefined || value === null) {
              const urgent = index >= 62;
              const wait = (index % 62) >> 1;
              const cook = index % 2 === 0 ? 1 : 3;
              throw new Error(
                `priority(urgent=${urgent ? "True" : "False"}, wait=${wait}, cook=${cook}) 没有返回数——是不是有的情况忘了写 return？`,
              );
            }
            return value;
          }),
        };
      }
      return { result };
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

installPyodideWorker<RunRequest>(runRequest);
