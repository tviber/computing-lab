import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import {
  TaskSheetPreview,
  publicSchema,
  type PublicQuestion,
  type SheetSchema,
} from "../../features/task-sheets";
import "../../features/task-sheets/ui/taskSheets.css";
import "./dashboard.css";

type SheetSummary = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  title: string;
  description: string;
  status: "draft" | "published";
  questionCount: number;
  assignmentCount: number;
  updatedAt: string;
};

type SheetPayload = { sheets: SheetSummary[] };

type PreviewState = {
  title: string;
  description: string;
  questions: PublicQuestion[];
};

function AssignDialog({
  sheet,
  onClose,
}: {
  sheet: SheetSummary;
  onClose: (assigned: boolean) => void;
}) {
  const { session } = useAuth();
  const classes = session?.memberships.filter((m) => m.role === "teacher") ?? [];
  const [classId, setClassId] = useState(classes[0]?.classId ?? "");
  const [title, setTitle] = useState(sheet.title);
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!classId) return setError("请选择要布置的班级。");
    setBusy(true);
    setError(null);
    void api
      .post(`/api/classes/${classId}/task-assignments`, {
        sheetId: sheet.id,
        title: title.trim() || sheet.title,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      })
      .then(() => onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  return (
    <div className="drawer-scrim" role="presentation" onClick={() => onClose(false)}>
      <aside
        aria-label={`布置「${sheet.title}」`}
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <p className="eyebrow">布置任务单</p>
          <h2>{sheet.title}</h2>
          <button
            aria-label="关闭"
            className="drawer-close"
            onClick={() => onClose(false)}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <label className="field-select">
          <span>班级</span>
          <select onChange={(e) => setClassId(e.target.value)} value={classId}>
            {classes.map((m) => (
              <option key={m.classId} value={m.classId}>
                {m.className}
              </option>
            ))}
          </select>
        </label>

        <label className="ts-field">
          <span>任务标题（布置时可改）</span>
          <input onChange={(e) => setTitle(e.target.value)} value={title} />
        </label>

        <label className="ts-field">
          <span>截止时间（可选）</span>
          <input onChange={(e) => setDueAt(e.target.value)} type="datetime-local" value={dueAt} />
        </label>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}
        {sheet.questionCount === 0 ? (
          <p className="ts-hint ts-wrong">这份任务单还没有题目，先去编辑器添加题目。</p>
        ) : null}

        <button
          className="button button-primary"
          disabled={busy || sheet.questionCount === 0 || classes.length === 0}
          onClick={submit}
          type="button"
        >
          布置给班级
        </button>
        <p className="drawer-note">布置会冻结当前题目快照——之后再改模板不影响这份任务。</p>
      </aside>
    </div>
  );
}

export function TaskSheetListPage() {
  const { status, role } = useAuth();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<SheetSummary | null>(null);
  const [previewing, setPreviewing] = useState<PreviewState | null>(null);
  const isAdmin = role === "admin";

  const load = useCallback(() => {
    void api
      .get<SheetPayload>("/api/task-sheets")
      .then((p) => setSheets(p.sheets))
      .catch((caught) => setError(describeApiError(caught)));
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  const createSheet = () => {
    void api
      .post<{ sheet: { id: string } }>("/api/task-sheets", { title: "未命名任务单" })
      .then((p) => navigate({ to: "/tasks/$sheetId/edit", params: { sheetId: p.sheet.id } }))
      .catch((caught) => setError(describeApiError(caught)));
  };

  const previewSheet = (sheet: SheetSummary) => {
    void api
      .get<{ sheet: { title: string; description: string; schema: SheetSchema } }>(
        `/api/task-sheets/${sheet.id}`,
      )
      .then((p) =>
        setPreviewing({
          title: p.sheet.title,
          description: p.sheet.description,
          questions: publicSchema(p.sheet.schema).questions,
        }),
      )
      .catch((caught) => setError(describeApiError(caught)));
  };

  const cloneSheet = (sheet: SheetSummary) => {
    void api
      .post<{ sheet: { id: string } }>(`/api/task-sheets/${sheet.id}/clone`)
      .then(() => {
        setNotice(`已复制「${sheet.title}」。`);
        load();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const removeSheet = (sheet: SheetSummary) => {
    const warn =
      sheet.assignmentCount > 0
        ? `「${sheet.title}」已被布置 ${sheet.assignmentCount} 次。删除模板不会影响已布置的任务和已收答卷，确定删除？`
        : `确定删除「${sheet.title}」？`;
    if (!window.confirm(warn)) return;
    void api
      .del(`/api/task-sheets/${sheet.id}`)
      .then(() => {
        setNotice(`已删除「${sheet.title}」。`);
        load();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous" || (role && !isStaffRole(role))) {
    return (
      <AppPageLayout className="dashboard-page">
        <main className="not-found" role="status">
          <p className="eyebrow">任务单 / 无权访问</p>
          <h1>只有教师或管理员可以管理任务单</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="dashboard-page">
      <main className="page-content">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="eyebrow">任务单</p>
            <h1>我的任务单</h1>
            <p>编辑题目模板，布置给班级，再到班级看板查阅提交。</p>
          </div>
          <button className="button button-primary" onClick={createSheet} type="button">
            + 新建任务单
          </button>
        </div>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="dashboard-note" role="status">
            {notice}
          </p>
        ) : null}

        <div className="ts-sheet-grid">
          {sheets.map((sheet) => (
            <article className="ts-sheet-card" key={sheet.id}>
              <h3>
                {sheet.title}{" "}
                <span
                  className={`ts-status-pill${sheet.status === "published" ? " is-published" : " is-draft"}`}
                >
                  {sheet.status === "published" ? "已发布" : "草稿"}
                </span>
              </h3>
              <p className="ts-sheet-meta">
                {sheet.questionCount} 题 · 布置 {sheet.assignmentCount} 次
                {isAdmin ? ` · ${sheet.ownerName}` : ""} · 更新于 {sheet.updatedAt.slice(0, 10)}
              </p>
              <div className="ts-sheet-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setAssigning(sheet)}
                  type="button"
                >
                  布置
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => previewSheet(sheet)}
                  type="button"
                >
                  预览
                </button>
                <Link
                  className="button button-secondary"
                  params={{ sheetId: sheet.id }}
                  to="/tasks/$sheetId/edit"
                >
                  编辑
                </Link>
                <button
                  className="button button-ghost"
                  onClick={() => cloneSheet(sheet)}
                  type="button"
                >
                  复制
                </button>
                <button
                  className="button button-ghost"
                  onClick={() => removeSheet(sheet)}
                  type="button"
                >
                  删除
                </button>
              </div>
            </article>
          ))}
          {sheets.length === 0 ? (
            <p className="ts-empty">还没有任务单——点右上角「新建任务单」开始出题。</p>
          ) : null}
        </div>
      </main>

      {assigning ? (
        <AssignDialog
          onClose={(assigned) => {
            setAssigning(null);
            if (assigned) {
              setNotice("已布置——到班级看板的「任务」分类查看提交情况。");
              load();
            }
          }}
          sheet={assigning}
        />
      ) : null}
      {previewing ? (
        <TaskSheetPreview
          description={previewing.description}
          onClose={() => setPreviewing(null)}
          questions={previewing.questions}
          title={previewing.title}
        />
      ) : null}
    </AppPageLayout>
  );
}
