import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import {
  TaskSheetEditor,
  TaskSheetPreview,
  cleanForSave,
  editorReducer,
  publicSchema,
  type EditorState,
  type SheetSchema,
} from "../../features/task-sheets";
import "../../features/task-sheets/ui/taskSheets.css";
import "./dashboard.css";

type SheetDetail = {
  id: string;
  title: string;
  description: string;
  schema: SheetSchema;
  status: "draft" | "published";
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function TaskSheetEditorPage() {
  const { sheetId } = useParams({ strict: false }) as { sheetId?: string };
  const { status, role } = useAuth();
  const [state, dispatch] = useReducer(editorReducer, {
    title: "",
    description: "",
    questions: [],
  });
  const [sheetStatus, setSheetStatus] = useState<"draft" | "published">("draft");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !sheetId) return;
    void api
      .get<{ sheet: SheetDetail }>(`/api/task-sheets/${sheetId}`)
      .then(({ sheet }) => {
        dispatch({
          type: "load",
          state: {
            title: sheet.title,
            description: sheet.description,
            questions: sheet.schema.questions,
          },
        });
        setSheetStatus(sheet.status);
        setLoaded(true);
      })
      .catch((caught) => setError(describeApiError(caught)));
  }, [status, sheetId]);

  const save = useCallback(
    (next: EditorState) => {
      if (!sheetId) return;
      setSaveState("saving");
      void api
        .patch(`/api/task-sheets/${sheetId}`, {
          title: next.title.trim() || "未命名任务单",
          description: next.description,
          schema: cleanForSave(next),
        })
        .then(() => {
          setSaveState("saved");
          setError(null);
        })
        .catch((caught) => {
          setSaveState("error");
          setError(describeApiError(caught));
        });
    },
    [sheetId],
  );

  useEffect(() => {
    if (!loaded) return;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(state), 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, loaded, save]);

  const toggleStatus = () => {
    if (!sheetId) return;
    const next = sheetStatus === "published" ? "draft" : "published";
    void api
      .patch(`/api/task-sheets/${sheetId}`, { status: next })
      .then(() => {
        setSheetStatus(next);
        setError(null);
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  if (status === "loading" || (status === "authenticated" && !loaded && !error)) {
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
          <h1>只有教师或管理员可以编辑任务单</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="dashboard-page">
      <main className="page-content">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="eyebrow">
              <Link to="/tasks">任务单</Link> / 编辑器
            </p>
            <h1>编辑任务单</h1>
            <p>改动会自动保存；布置时会冻结当前题目快照。</p>
          </div>
          <div className="ts-editor-status">
            <span aria-live="polite" className="save-indicator">
              {saveState === "saving" || saveState === "dirty"
                ? "保存中…"
                : saveState === "saved"
                  ? "已保存"
                  : saveState === "error"
                    ? "保存失败"
                    : ""}
              {saveState === "saved" ? <Icon name="check" size={12} /> : null}
            </span>
            <button
              className="button button-secondary"
              onClick={() => setPreviewing(true)}
              type="button"
            >
              预览
            </button>
            <button className="button button-secondary" onClick={toggleStatus} type="button">
              {sheetStatus === "published" ? "转为草稿" : "标记为已发布"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}

        <TaskSheetEditor dispatch={dispatch} state={state} />
      </main>

      {previewing ? (
        <TaskSheetPreview
          description={state.description}
          onClose={() => setPreviewing(false)}
          questions={publicSchema(cleanForSave(state)).questions}
          title={state.title.trim() || "未命名任务单"}
        />
      ) : null}
    </AppPageLayout>
  );
}
