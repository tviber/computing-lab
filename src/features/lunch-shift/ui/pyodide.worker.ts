/**
 * Pyodide module worker for the lunch-shift lab — runs student Python only
 * in the browser; the server never sees or executes it.
 *
 *   kind "priority": run the priority code, then evaluate
 *                    priority(urgent, wait, cook) for every one of the
 *                    2×31×2 = 124 input combinations → a flat value table.
 *   kind "compensate": same pattern for compensate(urgent, overtime,
 *                    delivered, price) — urgent × overtime(0–30) ×
 *                    delivered × price(0–30).
 *   kind "confirm":  AI intake — need_confirm(similarity, margin) over
 *                    each [similarity, margin] case sent with the
 *                    request → one strict boolean per order.
 *
 * Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { installPyodideWorker } from "../../../shared/worker/workerProtocol.ts";

type RunRequest =
  | { id: number; kind: "priority"; code: string }
  | { id: number; kind: "compensate"; code: string }
  | { id: number; kind: "confirm"; code: string; cases: [number, number][] };

const PRIORITY_CALL = `[priority(u, w, c) for u in (False, True) for w in range(31) for c in (1, 3)]`;
const COMPENSATE_CALL = `[compensate(u, o, d, p) for u in (False, True) for o in range(31) for d in (False, True) for p in range(31)]`;
const CONFIRM_CALL = `[need_confirm(s, m) for s, m in __import__("json").loads(cases_json)]`;

function mustFn(globals: ReturnType<PyodideInterface["toPy"]>, name: string, sig: string) {
  const fn = globals.get(name);
  if (fn === undefined || typeof fn.callKwargs !== "function") {
    throw new Error(`需要一个函数 ${sig}`);
  }
}

const SIGNATURES = {
  priority: "priority(urgent, wait, cook)",
  compensate: "compensate(urgent, overtime, delivered, price)",
  confirm: "need_confirm(similarity, margin)",
} as const;

async function runRequest(pyodide: PyodideInterface, request: RunRequest): Promise<object> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(request.code, { globals });
    const name = request.kind === "confirm" ? "need_confirm" : request.kind;
    mustFn(globals, name, SIGNATURES[request.kind as keyof typeof SIGNATURES]);
    if (request.kind === "confirm") {
      globals.set("cases_json", JSON.stringify(request.cases));
    }
    const call =
      request.kind === "compensate"
        ? COMPENSATE_CALL
        : request.kind === "confirm"
          ? CONFIRM_CALL
          : PRIORITY_CALL;
    const out = pyodide.runPython(call, { globals });
    try {
      const result = out.toJs() as unknown;
      if (request.kind === "confirm" && Array.isArray(result)) {
        // Strict booleans only — "False" or 1 would silently coerce, and
        // a wrong-typed verdict is exactly the bug the student must see.
        return {
          result: result.map((value, index) => {
            if (typeof value !== "boolean") {
              const [similarity, margin] = request.cases[index];
              throw new Error(
                `need_confirm(similarity=${similarity}, margin=${margin}) 要返回 True 或 False，实际返回了 ${JSON.stringify(value)}`,
              );
            }
            return value;
          }),
        };
      }
      if (request.kind !== "confirm" && Array.isArray(result)) {
        // None → name the exact case instead of a table-index error later;
        // True/False are perfectly good answers → 1/0.
        const name = request.kind;
        return {
          result: result.map((value, index) => {
            if (typeof value === "boolean") return value ? 1 : 0;
            if (value === undefined || value === null) {
              const args =
                name === "compensate"
                  ? `urgent=${index >= 1922}, overtime=${Math.floor((index % 1922) / 62)}, delivered=${index % 62 >= 31}, price=${index % 31}`
                  : `urgent=${index >= 62}, wait=${(index % 62) >> 1}, cook=${index % 2 === 0 ? 1 : 3}`;
              throw new Error(`${name}(${args}) 没有返回数。是不是有的情况忘了写 return？`);
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
