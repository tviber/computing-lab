import { Button } from "@ui-sdk/solid/button";
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
import { isStaffRole, useAuth, type AccountRole } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Redirect } from "../../shared/ui/AppLink";
import { Icon } from "../../shared/ui/Icon";
import { CreateAccountForm, ImportPanel } from "./AdminForms";
import type { AdminClass } from "./AdminTypes";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import "./admin.css";

type AdminUser = {
  id: string;
  studentNo: string;
  name: string;
  role: AccountRole;
  createdAt: string;
  classes: { classId: string; className: string; role: string }[];
};

type UsersPayload = { users: AdminUser[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 50;

type DeleteTarget = {
  label: string;
  description: string;
  endpoint: string;
};

export function AdminPage() {
  const auth = useAuth();
  const [classes, setClasses] = createSignal<AdminClass[]>([]);
  const [users, setUsers] = createSignal<AdminUser[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [resetTarget, setResetTarget] = createSignal<string | null>(null);
  const [resetPassword, setResetPassword] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal("");
  const [searchInput, setSearchInput] = createSignal("");
  const [jumpPage, setJumpPage] = createSignal("1");
  const [total, setTotal] = createSignal(0);
  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(null);
  const [reloadTick, setReloadTick] = createSignal(0);

  const reload = () => setReloadTick((n) => n + 1);

  const fetchParams = createMemo(() =>
    auth.status === "authenticated" && auth.role === "admin"
      ? { page: page(), search: search(), tick: reloadTick() }
      : null,
  );
  const fetchKey = createMemo(() => {
    const p = fetchParams();
    return p ? `${p.page}\0${p.search}\0${p.tick}` : "";
  });

  createEffect(fetchKey, (key) => {
    if (!key) return;
    const params = untrack(fetchParams);
    if (!params) return;
    let active = true;
    const query = new URLSearchParams({
      page: String(params.page),
      pageSize: String(PAGE_SIZE),
    });
    if (params.search) query.set("search", params.search);
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => {
        if (active) setClasses(payload.classes);
      })
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    void api
      .get<UsersPayload>(`/api/admin/users?${query.toString()}`)
      .then((payload) => {
        if (!active) return;
        if (payload.users.length === 0 && payload.page > 1) {
          setPage(payload.page - 1);
          return;
        }
        setUsers(payload.users);
        setTotal(payload.total);
        setPage(payload.page);
        setJumpPage(String(payload.page));
      })
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    return () => {
      active = false;
    };
  });

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const cancelReset = () => {
    setResetTarget(null);
    setResetPassword("");
  };

  const submitReset = (user: AdminUser) => {
    const password = resetPassword();
    void run(async () => {
      await api.put(`/api/admin/users/${user.id}/password`, { password });
      setResetTarget(null);
      setResetPassword("");
    });
  };

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    setError(null);
    await api.del(target.endpoint);
    setDeleteTarget(null);
    reload();
  };

  const submitSearch = (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setPage(1);
    setSearch(searchInput().trim());
  };

  const clearSearch = () => {
    setError(null);
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const pageCount = createMemo(() => Math.max(1, Math.ceil(total() / PAGE_SIZE)));

  const submitPageJump = (event: SubmitEvent) => {
    event.preventDefault();
    const target = Number(jumpPage());
    const count = pageCount();
    if (!Number.isInteger(target) || target < 1 || target > count) {
      setError(`请输入 1 到 ${count} 之间的页码。`);
      return;
    }
    setError(null);
    setPage(target);
  };

  return (
    <Switch
      fallback={
        <AppPageLayout class="admin-page">
          <main aria-labelledby="admin-title" class="page-content profile-main">
            <section class="profile-intro">
              <p class="eyebrow">管理 / ADMIN</p>
              <h1 id="admin-title">账号管理</h1>
              <p>手动注册已关闭。在这里创建账号、批量导入名单并管理账号角色和密码。</p>
            </section>

            <Show when={error()}>
              {(msg) => (
                <p class="auth-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>

            <div class="admin-grid">
              <section aria-labelledby="create-account-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">ACCOUNT</p>
                  <h2 id="create-account-title">创建账号</h2>
                </div>
                <CreateAccountForm classes={classes()} onCreated={reload} />
              </section>

              <section aria-labelledby="import-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">IMPORT</p>
                  <h2 id="import-title">批量导入账号</h2>
                </div>
                <ImportPanel onImported={reload} />
              </section>

              <section aria-labelledby="users-title" class="profile-card admin-users-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">USERS</p>
                  <h2 id="users-title">
                    {search() ? "搜索结果" : "全部账号"}（{total()}）
                  </h2>
                </div>
                <div class="admin-users-toolbar">
                  <form aria-label="搜索账号" class="admin-search-form" onSubmit={submitSearch}>
                    <label class="admin-search-field">
                      搜索学号或姓名
                      <input
                        aria-label="搜索学号或姓名"
                        onInput={(e) => setSearchInput(e.currentTarget.value)}
                        placeholder="输入学号或姓名"
                        type="search"
                        value={searchInput()}
                      />
                    </label>
                    <span class="admin-search-actions">
                      <Button class="button button-primary admin-inline-button" type="submit">
                        搜索
                      </Button>
                      <Button
                        class="button button-ghost admin-inline-button"
                        disabled={!search() && !searchInput()}
                        onClick={clearSearch}
                        type="button"
                      >
                        清除
                      </Button>
                    </span>
                  </form>
                </div>
                <div
                  aria-label="账号列表"
                  class="admin-account-table-scroll"
                  role="region"
                  tabindex={0}
                >
                  <table class="admin-table admin-users-table">
                    <colgroup>
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "36%" }} />
                      <col style={{ width: "18%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">学号</th>
                        <th scope="col">姓名</th>
                        <th scope="col">角色</th>
                        <th scope="col">班级</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={users()} keyed={(item) => item.id}>
                        {(user) => {
                          const isSelf = () => user().id === auth.session?.user.id;
                          const minPasswordLen = () => (isStaffRole(user().role) ? 8 : 4);
                          const availableClasses = createMemo(() =>
                            classes().filter(
                              (klass) => !user().classes.some((m) => m.classId === klass.id),
                            ),
                          );
                          return (
                            <tr>
                              <td>{user().studentNo}</td>
                              <td>{user().name}</td>
                              <td>
                                <select
                                  aria-label={`${user().name} 的角色`}
                                  class="field-select-native admin-table-select"
                                  disabled={busy() || isSelf()}
                                  onChange={(e) =>
                                    void run(() =>
                                      api.put(`/api/admin/users/${user().id}/role`, {
                                        role: e.currentTarget.value,
                                      }),
                                    )
                                  }
                                  title={isSelf() ? "不能修改自己的角色" : "管理员角色不能在此设置"}
                                  value={user().role}
                                >
                                  <option value="user">学生</option>
                                  <option value="teacher">教师</option>
                                  <option disabled value="admin">
                                    管理员
                                  </option>
                                </select>
                              </td>
                              <td>
                                <span class="admin-class-chips">
                                  <Show when={user().classes.length === 0}>{"—"}</Show>
                                  <For each={user().classes} keyed={(m) => m.classId}>
                                    {(m) => (
                                      <span class="admin-class-chip">
                                        {m().className}
                                        <Button
                                          aria-label={`把 ${user().name} 移出 ${m().className}`}
                                          class="admin-chip-remove"
                                          disabled={busy()}
                                          onClick={() =>
                                            void run(() =>
                                              api.del(
                                                `/api/admin/classes/${m().classId}/members/${user().id}`,
                                              ),
                                            )
                                          }
                                          title="移出该班级"
                                          type="button"
                                        >
                                          <Icon name="x" size={12} />
                                        </Button>
                                      </span>
                                    )}
                                  </For>
                                  <Show when={availableClasses().length > 0}>
                                    <select
                                      aria-label={`把 ${user().name} 加入班级`}
                                      class="field-select-native admin-table-select"
                                      disabled={busy()}
                                      onChange={(e) => {
                                        const classId = e.currentTarget.value;
                                        e.currentTarget.value = "";
                                        if (classId) {
                                          void run(() =>
                                            api.put(
                                              `/api/admin/classes/${classId}/members/${user().id}`,
                                            ),
                                          );
                                        }
                                      }}
                                      value=""
                                    >
                                      <option value="">＋ 加入班级</option>
                                      <For each={availableClasses()} keyed={(c) => c.id}>
                                        {(klass) => (
                                          <option value={klass().id}>{klass().name}</option>
                                        )}
                                      </For>
                                    </select>
                                  </Show>
                                </span>
                              </td>
                              <td>
                                <Show
                                  fallback={
                                    <span class="admin-actions">
                                      <Button
                                        class="button button-ghost admin-inline-button"
                                        disabled={busy() || isSelf()}
                                        onClick={() => setResetTarget(user().id)}
                                        title={
                                          isSelf()
                                            ? "请在个人设置里修改自己的密码"
                                            : "重置该账号的密码，其登录会话将失效"
                                        }
                                        type="button"
                                      >
                                        重置密码
                                      </Button>
                                      <Button
                                        class="button button-ghost admin-inline-button admin-danger"
                                        disabled={busy() || isSelf()}
                                        onClick={() =>
                                          setDeleteTarget({
                                            label: `账号「${user().name}」`,
                                            description: `删除后，${user().studentNo} 的班级关系、登录会话和做题记录都会被一并删除。`,
                                            endpoint: `/api/admin/users/${user().id}`,
                                          })
                                        }
                                        title={
                                          isSelf() ? "不能删除自己的账号" : "删除该账号及其全部数据"
                                        }
                                        type="button"
                                      >
                                        删除
                                      </Button>
                                    </span>
                                  }
                                  when={resetTarget() === user().id}
                                >
                                  <form
                                    class="admin-reset-form"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      if (!busy() && resetPassword().length >= minPasswordLen()) {
                                        submitReset(user());
                                      }
                                    }}
                                  >
                                    <input
                                      aria-label={`${user().name} 的新密码`}
                                      autocomplete="new-password"
                                      class="admin-reset-input"
                                      disabled={busy()}
                                      onInput={(e) => setResetPassword(e.currentTarget.value)}
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === "Escape" &&
                                          !event.isComposing &&
                                          event.keyCode !== 229
                                        ) {
                                          cancelReset();
                                        }
                                      }}
                                      placeholder={`新密码（至少 ${minPasswordLen()} 位）`}
                                      type="password"
                                      value={resetPassword()}
                                    />
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={busy() || resetPassword().length < minPasswordLen()}
                                      type="submit"
                                    >
                                      确定
                                    </Button>
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={busy()}
                                      onClick={cancelReset}
                                      type="button"
                                    >
                                      取消
                                    </Button>
                                  </form>
                                </Show>
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                      <Show when={users().length === 0}>
                        <tr>
                          <td colspan={5}>
                            {search() ? "没有匹配的账号，请更换学号或姓名搜索。" : "还没有账号。"}
                          </td>
                        </tr>
                      </Show>
                    </tbody>
                  </table>
                </div>
                <div class="admin-pagination">
                  <span class="admin-pagination-info">
                    共 {total()} 个账号 · 第 {page()} / {pageCount()} 页
                  </span>
                  <Button
                    class="button button-ghost admin-inline-button"
                    disabled={busy() || page() <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    type="button"
                  >
                    上一页
                  </Button>
                  <Button
                    class="button button-ghost admin-inline-button"
                    disabled={busy() || page() >= pageCount()}
                    onClick={() => setPage((p) => p + 1)}
                    type="button"
                  >
                    下一页
                  </Button>
                  <form
                    aria-label="跳转页码"
                    class="admin-pagination-jump"
                    onSubmit={submitPageJump}
                  >
                    <label for="admin-page-jump">跳到</label>
                    <input
                      aria-label="跳转页码"
                      class="admin-page-jump-input"
                      id="admin-page-jump"
                      inputmode="numeric"
                      max={pageCount()}
                      min={1}
                      onInput={(e) => setJumpPage(e.currentTarget.value)}
                      type="number"
                      value={jumpPage()}
                    />
                    <Button
                      class="button button-ghost admin-inline-button"
                      disabled={busy() || pageCount() <= 1}
                      type="submit"
                    >
                      跳转
                    </Button>
                  </form>
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
            <h1>只有管理员可以打开管理页面</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
