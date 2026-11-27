import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Redirect } from "../../shared/ui/AppLink";
import { CreateClassForm } from "./AdminForms";
import type { AdminClass } from "./AdminTypes";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import "./admin.css";

type DeleteTarget = { label: string; description: string; endpoint: string };

export function AdminClassesPage() {
  const auth = useAuth();
  const [classes, setClasses] = createSignal<AdminClass[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(null);
  const [reloadTick, setReloadTick] = createSignal(0);

  const reload = () => setReloadTick((n) => n + 1);

  const fetchKey = createMemo(() =>
    auth.status === "authenticated" && auth.role === "admin" ? String(reloadTick()) : "",
  );

  createEffect(fetchKey, (key) => {
    if (!key) return;
    let active = true;
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => {
        if (active) setClasses(payload.classes);
      })
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    return () => {
      active = false;
    };
  });

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    setError(null);
    await api.del(target.endpoint);
    setDeleteTarget(null);
    reload();
  };

  return (
    <Switch
      fallback={
        <AppPageLayout class="admin-page">
          <main aria-labelledby="classes-page-title" class="page-content profile-main">
            <section class="profile-intro">
              <p class="eyebrow">管理 / ADMIN</p>
              <h1 id="classes-page-title">班级管理</h1>
              <p>创建班级、管理邀请码和查看成员数。</p>
            </section>

            <Show when={error()}>
              {(msg) => (
                <p class="auth-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>

            <div class="admin-grid admin-grid-single">
              <section aria-labelledby="classes-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">CLASSES</p>
                  <h2 id="classes-title">班级列表</h2>
                </div>
                <CreateClassForm onCreated={reload} />
                <div
                  aria-label="班级列表"
                  class="admin-account-table-scroll"
                  role="region"
                  tabindex={0}
                >
                  <table class="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">班级</th>
                        <th scope="col">邀请码</th>
                        <th scope="col">成员数</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={classes()} keyed={(item) => item.id}>
                        {(klass) => (
                          <tr>
                            <td>{klass().name}</td>
                            <td>
                              <code>{klass().inviteCode}</code>
                            </td>
                            <td>{klass().memberCount}</td>
                            <td>
                              <Button
                                class="button button-ghost admin-inline-button"
                                disabled={klass().memberCount > 0}
                                onClick={() =>
                                  setDeleteTarget({
                                    label: `班级「${klass().name}」`,
                                    description: "删除后，这个班级和邀请码将不再可用。",
                                    endpoint: `/api/admin/classes/${klass().id}`,
                                  })
                                }
                                title={
                                  klass().memberCount > 0 ? "先移除全部成员才能删除" : "删除班级"
                                }
                                type="button"
                              >
                                删除
                              </Button>
                            </td>
                          </tr>
                        )}
                      </For>
                      <Show when={classes().length === 0}>
                        <tr>
                          <td colspan={4}>还没有班级。</td>
                        </tr>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <Show when={deleteTarget()}>
              {(target) => (
                <AdminConfirmDialog
                  confirmLabel="确认删除"
                  description={target().description}
                  onCancel={() => setDeleteTarget(null)}
                  onConfirm={confirmDelete}
                  pendingLabel="删除中…"
                  title={`确定删除${target().label}？`}
                />
              )}
            </Show>
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
            <h1>只有管理员可以打开班级管理</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
