import { useParams } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, Match, Show, Switch, untrack } from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink } from "../../shared/ui/AppLink";
import { Icon } from "../../shared/ui/Icon";
import {
  TaskSheetEditor,
  TaskSheetPreview,
  cleanForSave,
  editorReducer,
  publicSchema,
  type EditorAction,
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
  const params = useParams<{ sheetId?: string }>();
  const auth = useAuth();
  const [state, setState] = createSignal<EditorState>({
    title: "",
    description: "",
    questions: [],
  });
  const dispatch = (action: EditorAction) => {
    setState((current) => editorReducer(current, action));
  };
  const [sheetStatus, setSheetStatus] = createSignal<"draft" | "published">("draft");
  const [loaded, setLoaded] = createSignal(false);
  const [saveState, setSaveState] = createSignal<SaveState>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [previewing, setPreviewing] = createSignal(false);

  const loadKey = createMemo(() =>
    auth.status === "authenticated" && params.sheetId ? params.sheetId : "",
  );

  createEffect(loadKey, (sheetId) => {
    if (!sheetId) return;
    let active = true;
    void api
      .get<{ sheet: SheetDetail }>(`/api/task-sheets/${sheetId}`)
      .then(({ sheet }) => {
        if (!active) return;
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
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    return () => {
      active = false;
    };
  });

  const save = (next: EditorState) => {
    const sheetId = untrack(() => params.sheetId);
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
  };

  createEffect(
    () => (loaded() ? state() : null),
    (currentState) => {
      if (!currentState) return;
      setSaveState("dirty");
      const timer = setTimeout(() => save(currentState), 800);
      return () => clearTimeout(timer);
    },
  );

  const toggleStatus = () => {
    const sheetId = params.sheetId;
    if (!sheetId) return;
    const next = sheetStatus() === "published" ? "draft" : "published";
    void api
      .patch(`/api/task-sheets/${sheetId}`, { status: next })
      .then(() => {
        setSheetStatus(next);
        setError(null);
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  return (
    <Switch
      fallback={
        <AppPageLayout class="dashboard-page">
          <main class="page-content">
            <div class="dashboard-heading">
              <div class="dashboard-heading-copy">
                <p class="eyebrow">
                  <AppLink href="/tasks">任务单</AppLink> / 编辑器
                </p>
                <h1>编辑任务单</h1>
                <p>改动会自动保存；布置时会冻结当前题目快照。</p>
              </div>
              <div class="ts-editor-status">
                <span aria-live="polite" class="save-indicator">
                  {saveState() === "saving" || saveState() === "dirty"
                    ? "保存中…"
                    : saveState() === "saved"
                      ? "已保存"
                      : saveState() === "error"
                        ? "保存失败"
                        : ""}
                  <Show when={saveState() === "saved"}>
                    <Icon name="check" size={12} />
                  </Show>
                </span>
                <Button
                  class="button button-secondary"
                  onClick={() => setPreviewing(true)}
                  type="button"
                >
                  预览
                </Button>
                <Button class="button button-secondary" onClick={toggleStatus} type="button">
                  {sheetStatus() === "published" ? "转为草稿" : "标记为已发布"}
                </Button>
              </div>
            </div>

            <Show when={error()}>
              {(msg) => (
                <p class="test-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>

            <TaskSheetEditor dispatch={dispatch} state={state()} />
          </main>

          <Show when={previewing()}>
            <TaskSheetPreview
              description={state().description}
              onClose={() => setPreviewing(false)}
              questions={publicSchema(cleanForSave(state())).questions}
              title={state().title.trim() || "未命名任务单"}
            />
          </Show>
        </AppPageLayout>
      }
    >
      <Match
        when={
          auth.status === "loading" || (auth.status === "authenticated" && !loaded() && !error())
        }
      >
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous" || (auth.role && !isStaffRole(auth.role))}>
        <AppPageLayout class="dashboard-page">
          <main class="not-found" role="status">
            <p class="eyebrow">任务单 / 无权访问</p>
            <h1>只有教师或管理员可以编辑任务单</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
