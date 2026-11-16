import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { LAB_TITLES, type LabVisibility } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
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
  const { status, role } = useAuth();
  const [labs, setLabs] = useState<LabVisibility[] | null>(null);
  const [classes, setClasses] = useState<AdminClass[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LabDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [labsLoadError, setLabsLoadError] = useState<string | null>(null);
  const [classesLoadError, setClassesLoadError] = useState<string | null>(null);
  const [busyLab, setBusyLab] = useState<string | null>(null);

  const reload = useCallback(() => {
    void api.get<{ labs: LabVisibility[] }>("/api/labs").then(
      (payload) => {
        setLabs(payload.labs);
        setLabsLoadError(null);
      },
      (caught) => setLabsLoadError(describeApiError(caught)),
    );
    void api.get<{ classes: AdminClass[] }>("/api/admin/classes").then(
      (payload) => {
        setClasses(payload.classes);
        setClassesLoadError(null);
      },
      (caught) => {
        setClasses(null);
        setClassesLoadError(describeApiError(caught));
      },
    );
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "admin") reload();
  }, [status, role, reload]);

  // Drafts follow the freshly loaded server rows once both sources are in.
  useEffect(() => {
    if (!labs || classes === null) return;
    setDrafts(Object.fromEntries(labs.map((lab) => [lab.id, draftOf(lab, classes)])));
  }, [labs, classes]);

  const patchDraft = useCallback((labId: string, patch: (draft: LabDraft) => LabDraft) => {
    setDrafts((current) => {
      const draft = current[labId];
      return draft ? { ...current, [labId]: patch(draft) } : current;
    });
  }, []);

  const save = useCallback(
    async (lab: LabVisibility) => {
      const draft = drafts[lab.id];
      if (!draft || classes === null) return;
      setError(null);
      setBusyLab(lab.id);
      try {
        const allChecked = draft.checked.size === classes.length;
        await api.put(`/api/admin/labs/${lab.id}/visibility`, {
          hidden: draft.hidden,
          // Every class checked stores null — "all classes" also covers
          // classes created later; a subset stores the pinned ids.
          openClassIds: allChecked
            ? null
            : classes.map((c) => c.id).filter((id) => draft.checked.has(id)),
        });
        reload();
      } catch (caught) {
        setError(describeApiError(caught));
      } finally {
        setBusyLab(null);
      }
    },
    [classes, drafts, reload],
  );

  const pageError = [error, labsLoadError, classesLoadError].filter(Boolean).join(" ");

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
          <h1>只有管理员可以打开实验管理</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="labs-page-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / ADMIN</p>
          <h1 id="labs-page-title">实验管理</h1>
          <p>管理实验对学生和教师的开放状态。</p>
        </section>
        {pageError ? (
          <p className="auth-error" role="alert">
            {pageError}
          </p>
        ) : null}

        <div className="admin-grid admin-grid-single">
          <section className="profile-card" aria-labelledby="labs-title">
            <div className="profile-card-heading">
              <p className="eyebrow">LABS</p>
              <h2 id="labs-title">实验开放状态</h2>
            </div>
            <p className="admin-labs-hint">
              隐藏的实验只有管理员可见；开放的实验对勾选班级的成员可见。保存后生效。
            </p>
            <table className="admin-table">
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
                {labs?.map((lab) => {
                  const draft = drafts[lab.id];
                  const dirty =
                    draft && classes !== null ? !sameDraft(draft, draftOf(lab, classes)) : false;
                  return (
                    <tr key={lab.id}>
                      <td>
                        {LAB_TITLES[lab.id] ?? lab.id}
                        <span className="admin-lab-id">{lab.id}</span>
                      </td>
                      <td>{lab.stageCount}</td>
                      <td>
                        <span className={`admin-lab-state${draft?.hidden ? " is-hidden" : ""}`}>
                          {!draft
                            ? "…"
                            : draft.hidden
                              ? "已隐藏"
                              : classes === null
                                ? "班级数据不可用"
                                : draft.checked.size === classes.length
                                  ? "全部班级"
                                  : `${draft.checked.size} 个班`}
                        </span>
                      </td>
                      <td className="admin-lab-config">
                        {draft ? (
                          <>
                            <div className="admin-lab-mode" role="radiogroup">
                              <label className="admin-lab-mode-option">
                                <input
                                  checked={!draft.hidden}
                                  disabled={classes === null}
                                  name={`visibility-${lab.id}`}
                                  onChange={() =>
                                    patchDraft(lab.id, (d) => ({ ...d, hidden: false }))
                                  }
                                  type="radio"
                                />
                                开放
                              </label>
                              <label className="admin-lab-mode-option">
                                <input
                                  checked={draft.hidden}
                                  disabled={classes === null}
                                  name={`visibility-${lab.id}`}
                                  onChange={() =>
                                    patchDraft(lab.id, (d) => ({ ...d, hidden: true }))
                                  }
                                  type="radio"
                                />
                                隐藏（仅管理员可见）
                              </label>
                            </div>
                            {!draft.hidden ? (
                              <div className="admin-lab-classes">
                                <div className="admin-lab-class-actions">
                                  <button
                                    className="admin-lab-class-action"
                                    disabled={classes === null}
                                    onClick={() =>
                                      patchDraft(lab.id, (d) => ({
                                        ...d,
                                        checked: new Set(classes?.map((c) => c.id) ?? []),
                                      }))
                                    }
                                    type="button"
                                  >
                                    全选
                                  </button>
                                  <button
                                    className="admin-lab-class-action"
                                    disabled={classes === null}
                                    onClick={() =>
                                      patchDraft(lab.id, (d) => ({ ...d, checked: new Set() }))
                                    }
                                    type="button"
                                  >
                                    取消全部
                                  </button>
                                </div>
                                {classes?.map((klass) => (
                                  <label className="admin-lab-class" key={klass.id}>
                                    <input
                                      checked={draft.checked.has(klass.id)}
                                      disabled={classes === null}
                                      onChange={() =>
                                        patchDraft(lab.id, (d) => {
                                          const checked = new Set(d.checked);
                                          if (checked.has(klass.id)) checked.delete(klass.id);
                                          else checked.add(klass.id);
                                          return { ...d, checked };
                                        })
                                      }
                                      type="checkbox"
                                    />
                                    {klass.name}
                                  </label>
                                ))}
                                {classes?.length === 0 ? (
                                  <span className="admin-lab-class-empty">
                                    还没有班级，先在账号管理里创建。
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                      <td>
                        <button
                          className="button button-ghost admin-inline-button"
                          disabled={!dirty || classes === null || busyLab === lab.id}
                          onClick={() => void save(lab)}
                          title="保存这个实验的开放设置"
                          type="button"
                        >
                          {busyLab === lab.id ? "保存中…" : "保存"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {labs === null ? (
                  <tr>
                    <td colSpan={5}>{labsLoadError ? "实验列表加载失败。" : "正在加载实验…"}</td>
                  </tr>
                ) : labs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>还没有实验。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {classes === null && labs !== null ? (
              <p className="auth-error" role="status">
                班级列表不可用，开放范围暂时无法编辑。
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </AppPageLayout>
  );
}
