/**
 * Pyodide module worker — loads the Python runtime lazily and runs the
 * three student-facing functions of this lab:
 *
 *   kind "toner":  nearest_toner(r, g, b, toners) over every source color —
 *                  the guided stage-1 exercise. `toners` is a list of
 *                  [r,g,b] candidates; index 0 is paper.
 *   kind "pick":   choose_toners(toners, palette, images, k) → list of toner
 *                  indices to load. `images` are palette-index grids so the
 *                  choice is computed from data, not hand-picked.
 *   kind "mapall": map_color(r, g, b) over every source color → a full
 *                  mapping table (toner index or -1 for paper).
 *
 * Pick and mapall runs get `helpers` — the student's earlier code — plus a
 * fixed preamble with a reference nearest_toner and nn_table/quantize
 * utilities, so earlier work stays callable. If the helper file fails to
 * run, the reference implementation stays in place and the response
 * carries `helperFailed: true` so the UI can say whose code is running.
 *
 * Student code runs only here, in the browser. The server never sees or
 * executes it. Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { installPyodideWorker } from "../../../shared/worker/workerProtocol.ts";
import { assertPyCallable, withPyValue } from "../../../shared/lab/pyProxy.ts";

type RunRequest =
  | { id: number; kind: "toner"; code: string; colors: number[][]; toners: number[][] }
  | {
      id: number;
      kind: "pick";
      code: string;
      toners: number[][];
      palette: number[][];
      images: number[][][];
      k: number;
      helpers?: string;
    }
  | {
      id: number;
      kind: "mapall";
      code: string;
      colors: number[][];
      toners: number[][];
      palette: number[][];
      helpers?: string;
    };

async function runToner(
  pyodide: PyodideInterface,
  code: string,
  colors: number[][],
  toners: number[][],
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(code, { globals });
    withPyValue(pyodide.toPy(colors), (value) => globals.set("colors", value));
    withPyValue(pyodide.toPy(toners), (value) => globals.set("toners", value));
    assertPyCallable(globals, "nearest_toner", "nearest_toner(r, g, b, toners)。");
    const out = pyodide.runPython("[nearest_toner(c[0], c[1], c[2], toners) for c in colors]", {
      globals,
    });
    try {
      return out.toJs() as unknown[];
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

/**
 * Reference helpers for the pick/mapall stages. `nn_table` calls the global
 * `nearest_toner` at call time, so the student's own stage-1 rule is what
 * actually runs inside it when their code redefines it. Table entries are
 * absolute toner indices, or -1 for paper — identical to the TS domain rule:
 * squared euclidean distance, paper wins ties, then lowest toner index.
 */
const HELPERS_PREAMBLE = `def _dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

def nearest_toner(r, g, b, toners):
    best = 0
    best_d = _dist2([r, g, b], toners[0])
    for i in range(1, len(toners)):
        d = _dist2([r, g, b], toners[i])
        if d < best_d:
            best_d = d
            best = i
    return best

def nn_table(subset):
    # candidates[0] is paper -> table entry -1; candidates[i>0] is TONERS[subset[i-1]]
    candidates = [PAPER] + [TONERS[i] for i in subset]
    table = []
    for c in PALETTE:
        j = nearest_toner(c[0], c[1], c[2], candidates)
        table.append(-1 if j == 0 else subset[j - 1])
    return table

def quantize(image, table):
    return [[0 if px == 0 else table[px - 1] + 1 for px in row] for row in image]
`;

/**
 * Inject shared constants, the reference helpers, then the student's
 * earlier-stage code (which may redefine nearest_toner). Returns whether the
 * student helper file failed — in that case the reference rule is what
 * actually runs, and the caller must surface that instead of hiding it.
 */
function injectShared(
  pyodide: PyodideInterface,
  globals: ReturnType<PyodideInterface["toPy"]>,
  helpers: string | undefined,
  toners: number[][],
  palette: number[][],
  paper: number[],
): boolean {
  // Shared names first: nn_table resolves TONERS/PALETTE/PAPER at call time,
  // and student code may legitimately call helpers at module top level.
  withPyValue(pyodide.toPy(toners), (value) => globals.set("TONERS", value));
  withPyValue(pyodide.toPy(palette), (value) => globals.set("PALETTE", value));
  withPyValue(pyodide.toPy(paper), (value) => globals.set("PAPER", value));
  pyodide.runPython(HELPERS_PREAMBLE, { globals });
  if (!helpers?.trim()) return false;
  try {
    pyodide.runPython(helpers, { globals });
    return false;
  } catch {
    return true;
  }
}

async function runPick(
  pyodide: PyodideInterface,
  code: string,
  toners: number[][],
  palette: number[][],
  images: number[][][],
  k: number,
  helpers: string | undefined,
): Promise<{ results: unknown[]; helperFailed: boolean }> {
  const globals = pyodide.toPy({});
  try {
    const helperFailed = injectShared(pyodide, globals, helpers, toners, palette, [245, 245, 240]);
    pyodide.runPython(code, { globals });
    withPyValue(pyodide.toPy(images), (value) => globals.set("images", value));
    withPyValue(pyodide.toPy(k), (value) => globals.set("k", value));
    assertPyCallable(
      globals,
      "choose_toners",
      "choose_toners(toners, palette, images, k)，返回要装的粉的编号列表。",
    );
    const out = pyodide.runPython("choose_toners(TONERS, PALETTE, images, k)", { globals });
    try {
      return { results: out.toJs() as unknown[], helperFailed };
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

async function runMapAll(
  pyodide: PyodideInterface,
  code: string,
  colors: number[][],
  toners: number[][],
  palette: number[][],
  helpers: string | undefined,
): Promise<{ results: unknown[]; helperFailed: boolean }> {
  const globals = pyodide.toPy({});
  try {
    const helperFailed = injectShared(pyodide, globals, helpers, toners, palette, [245, 245, 240]);
    pyodide.runPython(code, { globals });
    withPyValue(pyodide.toPy(colors), (value) => globals.set("colors", value));
    assertPyCallable(
      globals,
      "map_color",
      "map_color(r, g, b)，返回墨粉编号（-1 表示留白/纸色）。",
    );
    const out = pyodide.runPython("[map_color(c[0], c[1], c[2]) for c in colors]", { globals });
    try {
      return { results: out.toJs() as unknown[], helperFailed };
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

installPyodideWorker<RunRequest>(async (pyodide, request) =>
  request.kind === "toner"
    ? { results: await runToner(pyodide, request.code, request.colors, request.toners) }
    : request.kind === "pick"
      ? await runPick(
          pyodide,
          request.code,
          request.toners,
          request.palette,
          request.images,
          request.k,
          request.helpers,
        )
      : await runMapAll(
          pyodide,
          request.code,
          request.colors,
          request.toners,
          request.palette,
          request.helpers,
        ),
);
