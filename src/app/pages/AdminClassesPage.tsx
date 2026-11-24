import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { CreateClassForm } from "./AdminForms";
import type { AdminClass } from "./AdminTypes";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import "./admin.css";

type DeleteTarget = { label: string; description: string; endpoint: string };

export function AdminClassesPage() {
  const { status, role } = useAuth();
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const reload = useCallback(() => {
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => setClasses(payload.classes))
      .catch((caught) => setError(describeApiError(caught)));
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "admin") reload();
  }, [status, role, reload]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setError(null);
    setBusy(true);
    try {
      await api.del(deleteTarget.endpoint);
      setDeleteTarget(null);
      reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }, [deleteTarget, reload]);

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
          <h1>只有管理员可以打开班级管理</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="classes-page-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / ADMIN</p>
          <h1 id="classes-page-title">班级管理</h1>
          <p>创建班级、管理邀请码和查看成员数。</p>
        </section>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-grid admin-grid-single">
          <section className="profile-card" aria-labelledby="classes-title">
            <div className="profile-card-heading">
              <p className="eyebrow">CLASSES</p>
              <h2 id="classes-title">班级列表</h2>
            </div>
            <CreateClassForm onCreated={reload} />
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">班级</th>
                  <th scope="col">邀请码</th>
                  <th scope="col">成员数</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((klass) => (
                  <tr key={klass.id}>
                    <td>{klass.name}</td>
                    <td>
                      <code>{klass.inviteCode}</code>
                    </td>
                    <td>{klass.memberCount}</td>
                    <td>
                      <button
                        className="button button-ghost admin-inline-button"
                        disabled={busy || klass.memberCount > 0}
                        onClick={() =>
                          setDeleteTarget({
                            label: `班级「${klass.name}」`,
                            description: "删除后，这个班级和邀请码将不再可用。",
                            endpoint: `/api/admin/classes/${klass.id}`,
                          })
                        }
                        title={klass.memberCount > 0 ? "先移除全部成员才能删除" : "删除班级"}
                        type="button"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={4}>还没有班级。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        {deleteTarget ? (
          <AdminConfirmDialog
            title={`确定删除${deleteTarget.label}？`}
            description={deleteTarget.description}
            busy={busy}
            confirmLabel={busy ? "删除中…" : "确认删除"}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmDelete}
          />
        ) : null}
      </main>
    </AppPageLayout>
  );
}
