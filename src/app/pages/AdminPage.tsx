import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth, type AccountRole } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import { CreateAccountForm, ImportPanel } from "./AdminForms";
import type { AdminClass } from "./AdminTypes";
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
  const { status, role, session } = useAuth();
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [jumpPage, setJumpPage] = useState("1");
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const reload = useCallback(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) query.set("search", search);
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => setClasses(payload.classes))
      .catch((caught) => setError(describeApiError(caught)));
    void api
      .get<UsersPayload>(`/api/admin/users?${query.toString()}`)
      .then((payload) => {
        if (payload.users.length === 0 && payload.page > 1) {
          setPage(payload.page - 1);
          return;
        }
        setUsers(payload.users);
        setTotal(payload.total);
        setPage(payload.page);
        setJumpPage(String(payload.page));
      })
      .catch((caught) => setError(describeApiError(caught)));
  }, [page, search]);

  useEffect(() => {
    if (status === "authenticated" && role === "admin") reload();
  }, [status, role, reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
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
    },
    [reload],
  );

  const cancelReset = useCallback(() => {
    setResetTarget(null);
    setResetPassword("");
  }, []);

  const submitReset = useCallback(
    (user: AdminUser) => {
      const password = resetPassword;
      void run(async () => {
        await api.put(`/api/admin/users/${user.id}/password`, { password });
        setResetTarget(null);
        setResetPassword("");
      });
    },
    [resetPassword, run],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    void run(async () => {
      await api.del(target.endpoint);
      setDeleteTarget(null);
    });
  }, [deleteTarget, run]);

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setPage(1);
      setSearch(searchInput.trim());
    },
    [searchInput],
  );

  const clearSearch = useCallback(() => {
    setError(null);
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const submitPageJump = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = Number(jumpPage);
      if (!Number.isInteger(target) || target < 1 || target > pageCount) {
        setError(`请输入 1 到 ${pageCount} 之间的页码。`);
        return;
      }
      setError(null);
      setPage(target);
    },
    [jumpPage, pageCount],
  );

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (role !== "admin") {
    return (
      <AppPageLayout className="admin-page">
        <main className="not-found" role="status">
          <p className="eyebrow">管理 / 无权访问</p>
          <h1>只有管理员可以打开管理页面</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="admin-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / ADMIN</p>
          <h1 id="admin-title">账号管理</h1>
          <p>手动注册已关闭。在这里创建账号、批量导入名单并管理账号角色和密码。</p>
        </section>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-grid">
          <section className="profile-card" aria-labelledby="create-account-title">
            <div className="profile-card-heading">
              <p className="eyebrow">ACCOUNT</p>
              <h2 id="create-account-title">创建账号</h2>
            </div>
            <CreateAccountForm classes={classes} onCreated={reload} />
          </section>

          <section className="profile-card" aria-labelledby="import-title">
            <div className="profile-card-heading">
              <p className="eyebrow">IMPORT</p>
              <h2 id="import-title">批量导入账号</h2>
            </div>
            <ImportPanel onImported={reload} />
          </section>

          <section className="profile-card admin-users-card" aria-labelledby="users-title">
            <div className="profile-card-heading">
              <p className="eyebrow">USERS</p>
              <h2 id="users-title">全部账号（{users.length}）</h2>
            </div>
            <div className="admin-users-toolbar">
              <form aria-label="搜索账号" className="admin-search-form" onSubmit={submitSearch}>
                <label className="admin-search-field">
                  搜索学号或姓名
                  <input
                    aria-label="搜索学号或姓名"
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="输入学号或姓名"
                    type="search"
                    value={searchInput}
                  />
                </label>
                <span className="admin-search-actions">
                  <button className="button button-primary admin-inline-button" type="submit">
                    搜索
                  </button>
                  <button
                    className="button button-ghost admin-inline-button"
                    disabled={!search && !searchInput}
                    onClick={clearSearch}
                    type="button"
                  >
                    清除
                  </button>
                </span>
              </form>
            </div>
            <table className="admin-table">
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
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.studentNo}</td>
                    <td>{user.name}</td>
                    <td>
                      <select
                        aria-label={`${user.name} 的角色`}
                        className="admin-role-select admin-table-select"
                        disabled={busy || user.id === session?.user.id}
                        onChange={(e) =>
                          void run(() =>
                            api.put(`/api/admin/users/${user.id}/role`, {
                              role: e.target.value,
                            }),
                          )
                        }
                        title={
                          user.id === session?.user.id
                            ? "不能修改自己的角色"
                            : "管理员角色不能在此设置"
                        }
                        value={user.role}
                      >
                        <option value="user">学生</option>
                        <option value="teacher">教师</option>
                        <option disabled value="admin">
                          管理员
                        </option>
                      </select>
                    </td>
                    <td>
                      <span className="admin-class-chips">
                        {user.classes.length === 0 ? "—" : null}
                        {user.classes.map((m) => (
                          <span className="admin-class-chip" key={m.classId}>
                            {m.className}
                            <button
                              aria-label={`把 ${user.name} 移出 ${m.className}`}
                              className="admin-chip-remove"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  api.del(`/api/admin/classes/${m.classId}/members/${user.id}`),
                                )
                              }
                              title="移出该班级"
                              type="button"
                            >
                              <Icon name="x" size={12} />
                            </button>
                          </span>
                        ))}
                        {classes.filter(
                          (klass) => !user.classes.some((m) => m.classId === klass.id),
                        ).length > 0 ? (
                          <select
                            aria-label={`把 ${user.name} 加入班级`}
                            className="admin-role-select admin-table-select"
                            disabled={busy}
                            onChange={(e) => {
                              const classId = e.target.value;
                              if (classId) {
                                void run(() =>
                                  api.put(`/api/admin/classes/${classId}/members/${user.id}`),
                                );
                              }
                            }}
                            value=""
                          >
                            <option value="">＋ 加入班级</option>
                            {classes
                              .filter((klass) => !user.classes.some((m) => m.classId === klass.id))
                              .map((klass) => (
                                <option key={klass.id} value={klass.id}>
                                  {klass.name}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      {resetTarget === user.id ? (
                        <form
                          className="admin-reset-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!busy && resetPassword.length >= (isStaffRole(user.role) ? 8 : 4)) {
                              submitReset(user);
                            }
                          }}
                        >
                          <input
                            aria-label={`${user.name} 的新密码`}
                            autoComplete="new-password"
                            className="admin-reset-input"
                            disabled={busy}
                            onChange={(e) => setResetPassword(e.target.value)}
                            onKeyDown={({ key, nativeEvent }) => {
                              if (
                                key === "Escape" &&
                                !nativeEvent.isComposing &&
                                nativeEvent.keyCode !== 229
                              ) {
                                cancelReset();
                              }
                            }}
                            placeholder={`新密码（至少 ${isStaffRole(user.role) ? 8 : 4} 位）`}
                            type="password"
                            value={resetPassword}
                          />
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={
                              busy || resetPassword.length < (isStaffRole(user.role) ? 8 : 4)
                            }
                            type="submit"
                          >
                            确定
                          </button>
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={cancelReset}
                            type="button"
                          >
                            取消
                          </button>
                        </form>
                      ) : (
                        <span className="admin-actions">
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy || user.id === session?.user.id}
                            onClick={() => setResetTarget(user.id)}
                            title={
                              user.id === session?.user.id
                                ? "请在个人设置里修改自己的密码"
                                : "重置该账号的密码，其登录会话将失效"
                            }
                            type="button"
                          >
                            重置密码
                          </button>
                          <button
                            className="button button-ghost admin-inline-button admin-danger"
                            disabled={busy || user.id === session?.user.id}
                            onClick={() =>
                              setDeleteTarget({
                                label: `账号「${user.name}」`,
                                description: `删除后，${user.studentNo} 的班级关系、登录会话和做题记录都会被一并删除。`,
                                endpoint: `/api/admin/users/${user.id}`,
                              })
                            }
                            title={
                              user.id === session?.user.id
                                ? "不能删除自己的账号"
                                : "删除该账号及其全部数据"
                            }
                            type="button"
                          >
                            删除
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5}>还没有账号。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="admin-pagination">
              <span className="admin-pagination-info">
                共 {total} 个账号 · 第 {page} / {pageCount} 页
              </span>
              <button
                className="button button-ghost admin-inline-button"
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="button button-ghost admin-inline-button"
                disabled={busy || page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                type="button"
              >
                下一页
              </button>
              <form
                aria-label="跳转页码"
                className="admin-pagination-jump"
                onSubmit={submitPageJump}
              >
                <label htmlFor="admin-page-jump">跳到</label>
                <input
                  aria-label="跳转页码"
                  className="admin-page-jump-input"
                  id="admin-page-jump"
                  inputMode="numeric"
                  min={1}
                  max={pageCount}
                  onChange={(e) => setJumpPage(e.target.value)}
                  type="number"
                  value={jumpPage}
                />
                <button
                  className="button button-ghost admin-inline-button"
                  disabled={busy || pageCount <= 1}
                  type="submit"
                >
                  跳转
                </button>
              </form>
            </div>
          </section>
        </div>

        {deleteTarget ? (
          <div className="admin-modal-backdrop" role="presentation">
            <section
              aria-labelledby="admin-delete-title"
              aria-modal="true"
              className="admin-modal"
              role="dialog"
            >
              <p className="eyebrow">确认操作</p>
              <h2 id="admin-delete-title">确定删除{deleteTarget.label}？</h2>
              <p>{deleteTarget.description}</p>
              <div className="admin-modal-actions">
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setDeleteTarget(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="button button-danger"
                  disabled={busy}
                  onClick={confirmDelete}
                  type="button"
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppPageLayout>
  );
}
