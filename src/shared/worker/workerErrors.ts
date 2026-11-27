/**
 * Errors and messages shared by every Pyodide lab worker client.
 */

/** A run that timed out while executing — the worker was terminated. */
export const PYODIDE_RUN_TIMEOUT_MESSAGE = "运行超时——代码里可能有死循环，已重置 Python 环境。";

/** A run that outlived the ~13 MB runtime-download budget. */
export const PYODIDE_LOAD_TIMEOUT_MESSAGE =
  "首次加载 Python 运行环境超时（需下载约 13MB）——请检查网络后再试一次。";

/** The worker was released while idle or because the page went away. */
export const PYODIDE_WORKER_RELEASED_MESSAGE = "Python 环境已释放，请重新运行。";

/** Fallback when a worker's failure message isn't a string. */
export const PYODIDE_RUN_FAILED_MESSAGE = "运行失败";

export class PythonRunError extends Error {
  constructor(
    message: string,
    readonly pythonTraceback: string | null = null,
  ) {
    super(message);
    this.name = "PythonRunError";
  }
}
