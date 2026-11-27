import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { LAB_TITLES, type LabVisibility } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Redirect } from "../../shared/ui/AppLink";
import { mergeAdminLabCatalog, type AdminLabCatalogEntry } from "../labCatalog";
import type { AdminClass } from "./AdminTypes";
import "./admin.css";

/** Editable per-lab visibility: hidden, or open to the checked classes. */
type LabDraft = { hidden: boolean; checked: Set<string> };

function draftOf(lab: LabVisibility, classes: AdminClass[]): LabDraft {
  const known = new Set(classes.map((c) => c.id));
  return {
    hidden: lab.hidden,
    // null (every class) renders as all boxes checked; a stored array keeps
    // only ids that still match a real class.
    checked:
      lab.openClassIds === null
        ? new Set(known)
        : new Set(lab.openClassIds.filter((id) => known.has(id))),
  };
}

function sameDraft(a: LabDraft, b: LabDraft): boolean {
  if (a.hidden !== b.hidden || a.checked.size !== b.checked.size) return false;
  for (const id of a.checked) if (!b.checked.has(id)) return false;
  return true;
}

export function AdminLabsPage() {
  const auth = useAuth();
  const [labs, setLabs] = createSignal<AdminLabCatalogEntry[] | null>(null);
  const [classes, setClasses] = createSignal<AdminClass[] | null>(null);
  const [drafts, setDrafts] = createSignal<Record<string, LabDraft>>({});
  const [error, setError] = createSignal<string | null>(null);
  const [labsLoadError, setLabsLoadError] = createSignal<string | null>(null);
  const [classesLoadError, setClassesLoadError] = createSignal<string | null>(null);
  const [catalogWarning, setCatalogWarning] = createSignal<string | null>(null);
  const [busyLab, setBusyLab] = createSignal<string | null>(null);
  const [reloadTick, setReloadTick] = createSignal(0);

  const reload = () => setReloadTick((n) => n + 1);

  const fetchKey = createMemo(() =>
    auth.status === "authenticated" && auth.role === "admin" ? String(reloadTick()) : "",
  );

  createEffect(fetchKey, (key) => {
    if (!key) return;
    let active = true;
    void api.get<{ labs: LabVisibility[] }>("/api/labs").then(
      (payload) => {
        if (!active) return;
        const merged = mergeAdminLabCatalog(payload.labs);
        setLabs(merged.labs);
        setCatalogWarning(
          merged.missingIds.length > 0
            ? `服务器尚未注册：${merged.missingIds.map((id) => LAB_TITLES[id] ?? id).join("、")}。这些实验暂时不能修改开放设置。`
            : null,
        );
        setLabsLoadError(null);
      },
      (caught) => {
        if (active) setLabsLoadError(describeApiError(caught));
      },
    );
    void api.get<{ classes: AdminClass[] }>("/api/admin/classes").then(
      (payload) => {
        if (!active) return;
        setClasses(payload.classes);
        setClassesLoadError(null);
      },
      (caught) => {
        if (!active) return;
        setClasses(null);
        setClassesLoadError(describeApiError(caught));
      },
    );
    return () => {
      active = false;
    };
  });

  // Drafts follow the freshly loaded server rows once both sources are in.
  createEffect(
    () => [labs(), classes()] as const,
    ([currentLabs, currentClasses]) => {
      if (!currentLabs || currentClasses === null) return;
      setDrafts(
        Object.fromEntries(currentLabs.map((lab) => [lab.id, draftOf(lab, currentClasses)])),
      );
    },
  );

  const patchDraft = (labId: string, patch: (draft: LabDraft) => LabDraft) => {
    setDrafts((current) => {
      const draft = current[labId];
      return draft ? { ...current, [labId]: patch(draft) } : current;
    });
  };

  const save = async (lab: AdminLabCatalogEntry) => {
    const draft = drafts()[lab.id];
    const currentClasses = classes();
    if (!lab.serverRegistered || !draft || currentClasses === null) return;
    setError(null);
    setBusyLab(lab.id);
    try {
      const allChecked = draft.checked.size === currentClasses.length;
      await api.put(`/api/admin/labs/${lab.id}/visibility`, {
        hidden: draft.hidden,
        // Every class checked stores null — "all classes" also covers
        // classes created later; a subset stores the pinned ids.
        openClassIds: allChecked
          ? null
          : currentClasses.map((c) => c.id).filter((id) => draft.checked.has(id)),
      });
      reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusyLab(null);
    }
  };

  const pageError = createMemo(() =>
    [error(), labsLoadError(), classesLoadError()].filter(Boolean).join(" "),
  );
  const labIds = createMemo(() => (labs() ?? []).map((lab) => lab.id));
  const labsById = createMemo(() => new Map((labs() ?? []).map((lab) => [lab.id, lab])));
  const classIds = createMemo(() => (classes() ?? []).map((klass) => klass.id));
  const classesById = createMemo(
    () => new Map((classes() ?? []).map((klass) => [klass.id, klass])),
  );

  return (
    <Switch
      fallback={
        <AppPageLayout class="admin-page">
          <main aria-labelledby="labs-page-title" class="page-content profile-main">
            <section class="profile-intro">
              <p class="eyebrow">管理 / ADMIN</p>
              <h1 id="labs-page-title">实验管理</h1>
              <p>管理实验对学生和教师的开放状态。</p>
            </section>
            <Show when={pageError()}>
              {(msg) => (
                <p class="auth-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>
            <Show when={catalogWarning()}>
              {(msg) => (
                <p class="auth-error" role="status">
                  {msg()}
                </p>
              )}
            </Show>

            <div class="admin-grid admin-grid-single">
              <section aria-labelledby="labs-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">LABS</p>
                  <h2 id="labs-title">实验开放状态</h2>
                </div>
                <p class="admin-labs-hint">
                  隐藏的实验只有管理员可见；开放的实验对勾选班级的成员可见。保存后生效。
                </p>
                <div
                  aria-label="实验开放设置"
                  class="admin-account-table-scroll"
                  role="region"
                  tabindex={0}
                >
                  <table class="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">实验</th>
                        <th scope="col">关卡数</th>
                        <th scope="col">状态</th>
                        <th scope="col">开放设置</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={labIds()}>
                        {(labId) => {
                          const lab = () => labsById().get(labId)!;
                          const draft = () => drafts()[labId];
                          const dirty = () => {
                            const d = draft();
                            const cls = classes();
                            return d && cls !== null ? !sameDraft(d, draftOf(lab(), cls)) : false;
                          };
                          const stateLabel = () => {
                            if (!lab().serverRegistered) return "待服务器同步";
                            const d = draft();
                            if (!d) return "…";
                            if (d.hidden) return "已隐藏";
                            const cls = classes();
                            if (cls === null) return "班级数据不可用";
                            return d.checked.size === cls.length
                              ? "全部班级"
                              : `${d.checked.size} 个班`;
                          };

                          return (
                            <tr>
                              <td>
                                {LAB_TITLES[labId] ?? labId}
                                <span class="admin-lab-id">{labId}</span>
                              </td>
                              <td>{lab().stageCount}</td>
                              <td>
                                <span
                                  class={`admin-lab-state${draft()?.hidden ? " is-hidden" : ""}`}
                                >
                                  {stateLabel()}
                                </span>
                              </td>
                              <td class="admin-lab-config">
                                <Show
                                  fallback={<span>服务器尚未注册此实验，暂不能修改开放设置。</span>}
                                  when={lab().serverRegistered}
                                >
                                  <Show when={draft()}>
                                    {(currentDraft) => (
                                      <>
                                        <div class="admin-lab-mode" role="radiogroup">
                                          <label class="admin-lab-mode-option">
                                            <input
                                              checked={!currentDraft().hidden}
                                              disabled={classes() === null}
                                              name={`visibility-${labId}`}
                                              onChange={() =>
                                                patchDraft(labId, (d) => ({
                                                  ...d,
                                                  hidden: false,
                                                }))
                                              }
                                              type="radio"
                                            />
                                            开放
                                          </label>
                                          <label class="admin-lab-mode-option">
                                            <input
                                              checked={currentDraft().hidden}
                                              disabled={classes() === null}
                                              name={`visibility-${labId}`}
                                              onChange={() =>
                                                patchDraft(labId, (d) => ({
                                                  ...d,
                                                  hidden: true,
                                                }))
                                              }
                                              type="radio"
                                            />
                                            隐藏（仅管理员可见）
                                          </label>
                                        </div>
                                        <Show when={!currentDraft().hidden}>
                                          <div class="admin-lab-classes">
                                            <div class="admin-lab-class-actions">
                                              <Button
                                                class="admin-lab-class-action"
                                                disabled={classes() === null}
                                                onClick={() =>
                                                  patchDraft(labId, (d) => ({
                                                    ...d,
                                                    checked: new Set(
                                                      classes()?.map((c) => c.id) ?? [],
                                                    ),
                                                  }))
                                                }
                                                type="button"
                                              >
                                                全选
                                              </Button>
                                              <Button
                                                class="admin-lab-class-action"
                                                disabled={classes() === null}
                                                onClick={() =>
                                                  patchDraft(labId, (d) => ({
                                                    ...d,
                                                    checked: new Set(),
                                                  }))
                                                }
                                                type="button"
                                              >
                                                取消全部
                                              </Button>
                                            </div>
                                            <For each={classIds()}>
                                              {(klassId) => {
                                                const klass = () => classesById().get(klassId)!;
                                                return (
                                                  <label class="admin-lab-class">
                                                    <input
                                                      checked={currentDraft().checked.has(klassId)}
                                                      disabled={classes() === null}
                                                      onChange={() =>
                                                        patchDraft(labId, (d) => {
                                                          const checked = new Set(d.checked);
                                                          if (checked.has(klassId))
                                                            checked.delete(klassId);
                                                          else checked.add(klassId);
                                                          return { ...d, checked };
                                                        })
                                                      }
                                                      type="checkbox"
                                                    />
                                                    {klass().name}
                                                  </label>
                                                );
                                              }}
                                            </For>
                                            <Show when={classes()?.length === 0}>
                                              <span class="admin-lab-class-empty">
                                                还没有班级，先在账号管理里创建。
                                              </span>
                                            </Show>
                                          </div>
                                        </Show>
                                      </>
                                    )}
                                  </Show>
                                </Show>
                              </td>
                              <td>
                                <Button
                                  class="button button-ghost admin-inline-button"
                                  disabled={
                                    !lab().serverRegistered ||
                                    !dirty() ||
                                    classes() === null ||
                                    busyLab() === labId
                                  }
                                  onClick={() => void save(lab())}
                                  title="保存这个实验的开放设置"
                                  type="button"
                                >
                                  {busyLab() === labId ? "保存中…" : "保存"}
                                </Button>
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                      <Switch>
                        <Match when={labs() === null}>
                          <tr>
                            <td colspan={5}>
                              {labsLoadError() ? "实验列表加载失败。" : "正在加载实验…"}
                            </td>
                          </tr>
                        </Match>
                        <Match when={labs()?.length === 0}>
                          <tr>
                            <td colspan={5}>还没有实验。</td>
                          </tr>
                        </Match>
                      </Switch>
                    </tbody>
                  </table>
                </div>
                <Switch>
                  <Match when={classes() === null && labs() !== null && classesLoadError()}>
                    <p class="auth-error" role="status">
                      班级列表不可用，开放范围暂时无法编辑。
                    </p>
                  </Match>
                  <Match when={classes() === null && labs() !== null}>
                    <p class="admin-labs-hint" role="status">
                      正在加载班级列表…
                    </p>
                  </Match>
                </Switch>
              </section>
            </div>
          </main>
        </AppPageLayout>
      }
    >
      <Match when={auth.status === "loading"}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous"}>
        <Redirect replace to="/login" />
      </Match>
      <Match when={auth.role !== "admin"}>
        <AppPageLayout class="admin-page">
          <main class="not-found" role="status">
            <p class="eyebrow">管理 / 无权访问</p>
            <h1>只有管理员可以打开实验管理</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
