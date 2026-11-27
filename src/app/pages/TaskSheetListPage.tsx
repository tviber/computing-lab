import { useNavigate } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/solid/dialog";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink } from "../../shared/ui/AppLink";
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

function AssignDialog(props: { sheet: SheetSummary; onClose: (assigned: boolean) => void }) {
  const auth = useAuth();
  const classes = createMemo(
    () => auth.session?.memberships.filter((m) => m.role === "teacher") ?? [],
  );
  const [classId, setClassId] = createSignal(untrack(() => classes()[0]?.classId ?? ""));
  const [title, setTitle] = createSignal(untrack(() => props.sheet.title));
  const [dueAt, setDueAt] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = () => {
    const cid = classId();
    if (!cid) {
      setError("请选择要布置的班级。");
      return;
    }
    setBusy(true);
    setError(null);
    void api
      .post(`/api/classes/${cid}/task-assignments`, {
        sheetId: props.sheet.id,
        title: title().trim() || props.sheet.title,
        dueAt: dueAt() ? new Date(dueAt()).toISOString() : null,
      })
      .then(() => props.onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) props.onClose(false);
      }}
      open
    >
      <DialogBackdrop class="drawer-backdrop" />
      <DialogContent aria-label={`布置「${props.sheet.title}」`} class="drawer assign-drawer">
        <header>
          <p class="eyebrow">布置任务单</p>
          <DialogTitle>{props.sheet.title}</DialogTitle>
          <DialogClose aria-label="关闭" class="drawer-close" type="button">
            <Icon name="x" size={16} />
          </DialogClose>
        </header>

        <label class="field-select">
          <span>班级</span>
          <select onChange={(e) => setClassId(e.currentTarget.value)} value={classId()}>
            <For each={classes()}>
              {(m) => (
                <option selected={m.classId === classId()} value={m.classId}>
                  {m.className}
                </option>
              )}
            </For>
          </select>
        </label>

        <label class="ts-field">
          <span>任务标题（布置时可改）</span>
          <input onInput={(e) => setTitle(e.currentTarget.value)} value={title()} />
        </label>

        <label class="ts-field">
          <span>截止时间（可选）</span>
          <input
            onInput={(e) => setDueAt(e.currentTarget.value)}
            type="datetime-local"
            value={dueAt()}
          />
        </label>

        <Show when={error()}>
          {(msg) => (
            <p class="test-error" role="alert">
              {msg()}
            </p>
          )}
        </Show>
        <Show when={props.sheet.questionCount === 0}>
          <p class="ts-hint ts-wrong">这份任务单还没有题目，先去编辑器添加题目。</p>
        </Show>

        <Button
          class="button button-primary"
          disabled={busy() || props.sheet.questionCount === 0 || classes().length === 0}
          onClick={submit}
          type="button"
        >
          布置给班级
        </Button>
        <p class="drawer-note">布置会冻结当前题目快照——之后再改模板不影响这份任务。</p>
      </DialogContent>
    </Dialog>
  );
}

export function TaskSheetListPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [sheets, setSheets] = createSignal<SheetSummary[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [assigning, setAssigning] = createSignal<SheetSummary | null>(null);
  const [previewing, setPreviewing] = createSignal<PreviewState | null>(null);
  const [reloadTick, setReloadTick] = createSignal(0);

  const isAdmin = createMemo(() => auth.role === "admin");
  const load = () => setReloadTick((n) => n + 1);

  const fetchKey = createMemo(() => (auth.status === "authenticated" ? String(reloadTick()) : ""));

  createEffect(fetchKey, (key) => {
    if (!key) return;
    let active = true;
    void api
      .get<SheetPayload>("/api/task-sheets")
      .then((p) => {
        if (active) setSheets(p.sheets);
      })
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    return () => {
      active = false;
    };
  });

  const createSheet = () => {
    void api
      .post<{ sheet: { id: string } }>("/api/task-sheets", { title: "未命名任务单" })
      .then((p) => navigate(`/tasks/${p.sheet.id}/edit`))
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

  return (
    <Switch
      fallback={
        <AppPageLayout class="dashboard-page">
          <main class="page-content">
            <div class="dashboard-heading">
              <div class="dashboard-heading-copy">
                <p class="eyebrow">任务单</p>
                <h1>我的任务单</h1>
                <p>编辑题目模板，布置给班级，再到班级看板查阅提交。</p>
              </div>
              <Button class="button button-primary" onClick={createSheet} type="button">
                + 新建任务单
              </Button>
            </div>

            <Show when={error()}>
              {(msg) => (
                <p class="test-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>
            <Show when={notice()}>
              {(msg) => (
                <p class="dashboard-note" role="status">
                  {msg()}
                </p>
              )}
            </Show>

            <div class="ts-sheet-grid">
              <For each={sheets()}>
                {(sheet) => (
                  <article class="ts-sheet-card">
                    <h3>
                      {sheet.title}{" "}
                      <span
                        class={`ts-status-pill${sheet.status === "published" ? " is-published" : " is-draft"}`}
                      >
                        {sheet.status === "published" ? "已发布" : "草稿"}
                      </span>
                    </h3>
                    <p class="ts-sheet-meta">
                      {sheet.questionCount} 题 · 布置 {sheet.assignmentCount} 次
                      {isAdmin() ? ` · ${sheet.ownerName}` : ""} · 更新于{" "}
                      {sheet.updatedAt.slice(0, 10)}
                    </p>
                    <div class="ts-sheet-actions">
                      <Button
                        class="button button-secondary"
                        onClick={() => setAssigning(sheet)}
                        type="button"
                      >
                        布置
                      </Button>
                      <Button
                        class="button button-secondary"
                        onClick={() => previewSheet(sheet)}
                        type="button"
                      >
                        预览
                      </Button>
                      <AppLink class="button button-secondary" href={`/tasks/${sheet.id}/edit`}>
                        编辑
                      </AppLink>
                      <Button
                        class="button button-ghost"
                        onClick={() => cloneSheet(sheet)}
                        type="button"
                      >
                        复制
                      </Button>
                      <Button
                        class="button button-ghost"
                        onClick={() => removeSheet(sheet)}
                        type="button"
                      >
                        删除
                      </Button>
                    </div>
                  </article>
                )}
              </For>
              <Show when={sheets().length === 0}>
                <p class="ts-empty">还没有任务单——点右上角「新建任务单」开始出题。</p>
              </Show>
            </div>
          </main>

          <Show keyed when={assigning()}>
            {(sheet) => (
              <AssignDialog
                onClose={(assigned) => {
                  setAssigning(null);
                  if (assigned) {
                    setNotice("已布置——到班级看板的「任务」分类查看提交情况。");
                    load();
                  }
                }}
                sheet={sheet}
              />
            )}
          </Show>
          <Show when={previewing()}>
            {(preview) => (
              <TaskSheetPreview
                description={preview().description}
                onClose={() => setPreviewing(null)}
                questions={preview().questions}
                title={preview().title}
              />
            )}
          </Show>
        </AppPageLayout>
      }
    >
      <Match when={auth.status === "loading"}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous" || (auth.role && !isStaffRole(auth.role))}>
        <AppPageLayout class="dashboard-page">
          <main class="not-found" role="status">
            <p class="eyebrow">任务单 / 无权访问</p>
            <h1>只有教师或管理员可以管理任务单</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
