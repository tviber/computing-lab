/**
 * Thin fetch wrapper for the lab API. Cookies carry the session, so every
 * request is `credentials: "same-origin"`; failures surface as ApiError with
 * the server's machine-readable code.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** Shared lab /project envelope — every lab returns this shape plus extras. */
export type LabProjectPayload<TDraft> = {
  labId: string;
  currentStage: number;
  passedStages: number[];
  /** Per-stage drafts keyed by stage index (`draft_graph` column). */
  drafts: Record<string, TDraft>;
  /** Server-assigned revision of the latest applied write per stage — the
   *  client's next PUT sends it back as `expectedRevision` (compare-and-swap). */
  draftRevisions?: Record<string, number>;
};

/** Autosave lifecycle flags shared by every lab's lesson state. "conflict"
 * settles a save the server rejected for a newer write it already holds —
 * the page reloads the project so the student sees the winning draft.
 * "sync-error" means the reload after a rejection itself failed: the local
 * draft is still there and the stage stays fenced until a retry syncs it. */
export type SaveStatus =
  "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "sync-error";

export const API_ERROR_MESSAGES: Record<string, string> = {
  "invalid-credentials": "学号或密码不正确。",
  "invalid-student-no": "学号只能包含字母、数字、下划线或连字符。",
  "invalid-name": "请填写姓名。",
  "weak-password": "密码太短（学生至少 4 位，教师/管理员至少 8 位）。",
  "too-many-attempts": "尝试次数过多，请稍后再试。",
  "rate-limited": "提交太频繁了，稍后再试。",
  "payload-too-large": "提交内容太大，无法处理。",
  "invalid-response": "服务器返回了无法解析的内容。",
  "current-password-incorrect": "当前密码不正确。",
  "same-password": "新密码不能与当前密码相同。",
  unauthenticated: "请先登录。",
  "not-a-member": "你不在这个班级里。",
  "teacher-required": "只有教师或管理员可以访问。",
  "admin-required": "需要管理员权限。",
  "student-no-taken": "该学号已被占用。",
  "class-not-found": "班级不存在，请检查班级或邀请码。",
  "invalid-role": "角色无效（可选：admin / teacher / user）。",
  "invalid-row": "该行格式不正确。",
  "invalid-import": "导入内容为空或格式不正确。",
  "invalid-invite-code": "邀请码只能包含字母、数字、下划线或连字符。",
  "invite-code-taken": "该邀请码已被使用。",
  "admin-role-not-editable": "不能把角色设置为管理员。",
  "cannot-edit-own-role": "不能修改自己的角色。",
  "cannot-edit-own-password": "请在个人设置里修改自己的密码。",
  "cannot-delete-self": "不能删除自己的账号。",
  "already-member": "该用户已在这个班级里。",
  "user-not-found": "账号不存在。",
  "class-not-empty": "班级里还有成员，请先移除全部成员。",
  "membership-not-found": "该用户不在这个班级里。",
  "student-member-required": "只能对本班学生执行该操作。",
  "not-a-student-account": "该账号不是学生账号，请让管理员处理。",
  "stage-locked": "这一关还没有解锁。",
  "final-used": "正式挑战已提交，不能重复提交。",
  "missing-run": "先在页面里运行代码，算出词表和结果表后再提交。",
  "invalid-stage": "关卡编号无效。",
  "unknown-stage": "关卡不存在。",
  "invalid-resolution": "分辨率无效（宽和高需在 2～64 之间）。",
  "square-resolution-required": "这一关要求正方形分辨率（宽 = 高）。",
  "tall-resolution-required": "这一关要求高度大于宽度（高 > 宽）。",
  "invalid-toners": "墨粉选择无效。",
  "invalid-table": "映射表无效（每个源色都要有一条映射）。",
  "toner-not-loaded": "映射到了粉盒里没有的墨粉。",
  "lab-not-available": "这个实验暂未开放。",
  "unknown-lab": "未知的实验。",
  "invalid-revision": "无效的版本参数。",
  "not-found": "没有找到对应的数据。",
  "invalid-title": "标题无效（1～120 字符）。",
  "invalid-description": "说明太长了。",
  "invalid-status": "状态无效。",
  "invalid-sheet": "任务单无效。",
  "sheet-not-found": "任务单不存在或无权访问。",
  "sheet-empty": "任务单还没有题目。",
  "sheet-incomplete": "任务单还有题目没有出完，请先补全再布置。",
  "invalid-schema": "题目数据格式无效。",
  "invalid-questions": "题目数量超出限制。",
  "invalid-question": "题目内容无效。",
  "invalid-question-type": "题目类型无效。",
  "invalid-fill": "填空题设置无效（每个空需要 1～10 个可接受答案）。",
  "invalid-choice": "选择题设置无效（需要选项和正确答案）。",
  "invalid-short": "简答题设置无效。",
  "duplicate-question-id": "题目编号重复。",
  "invalid-due-at": "截止时间无效。",
  "assignment-not-found": "任务不存在。",
  "assignment-has-responses": "已有学生作答，不能修改或删除——可以归档或重新布置。",
  "student-required": "只有学生可以作答。",
  "response-locked": "已提交的答卷不能修改。",
  "response-not-found": "答卷不存在。",
  "response-not-submitted": "这份答卷还没有提交。",
  "required-question-unanswered": "还有必答题没有作答。",
  "invalid-review-score": "批改分数无效。",
  "internal-error": "服务器出错了，请稍后再试。",
  offline: "网络连接失败，请检查网络。",
};

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return API_ERROR_MESSAGES[error.code] ?? `请求失败（${error.code}）。`;
  }
  return API_ERROR_MESSAGES.offline;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Non-JSON body (proxy error page, truncated response): never surface a
      // bare SyntaxError to callers.
      throw new ApiError(response.status, response.ok ? "invalid-response" : "internal-error");
    }
  }
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "internal-error";
    throw new ApiError(response.status, code);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};
