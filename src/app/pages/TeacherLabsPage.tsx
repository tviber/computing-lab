import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { LAB_TITLES, type LabVisibility, type TeacherLabView } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { mergeTeacherLabCatalog, type TeacherLabCatalogEntry } from "../labCatalog";
import "./admin.css";

type TeacherLabPayload = {
  classes: { id: string; name: string }[];
  labs: TeacherLabView[];
};

type TeacherLabData = Omit<TeacherLabPayload, "labs"> & { labs: TeacherLabCatalogEntry[] };

/** Busy flag per (lab, class) checkbox while a toggle is in flight. */
function gateKey(labId: string, classId: string) {
  return `${labId}:${classId}`;
}

export function TeacherLabsPage() {
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [data, setData] = useState<TeacherLabData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const reload = useCallback(() => {
    void Promise.allSettled([
      api.get<TeacherLabPayload>("/api/teacher/labs"),
      api.get<{ labs: LabVisibility[] }>("/api/labs"),
    ]).then(([teacherResult, catalogResult]) => {
      if (teacherResult.status === "rejected") {
        setData(null);
        setError(describeApiError(teacherResult.reason));
        return;
      }
      const payload = teacherResult.value;
      const visibilityRows = catalogResult.status === "fulfilled" ? catalogResult.value.labs : null;
      const merged = mergeTeacherLabCatalog(payload.labs, payload.classes, visibilityRows);
      setData({ ...payload, labs: merged.labs });
      setCatalogWarning(
        merged.missingIds.length > 0
          ? `服务器尚未注册：${merged.missingIds.map((id) => LAB_TITLES[id] ?? id).join("、")}。这些实验暂时不能修改开放设置。`
          : null,
      );
      setError(null);
    });
  }, []);

  useEffect(() => {
    if (status === "authenticated" && isStaff) reload();
  }, [status, isStaff, reload]);

  const toggle = useCallback(
    async (lab: TeacherLabCatalogEntry, classId: string, open: boolean) => {
      if (!lab.serverRegistered) return;
      const key = gateKey(lab.id, classId);
      setError(null);
      setBusy((current) => new Set(current).add(key));
      try {
        await api.put(`/api/teacher/labs/${lab.id}/classes/${classId}/open`, { open });
        setData((current) =>
          current
            ? {
                ...current,
                labs: current.labs.map((row) =>
                  row.id !== lab.id
                    ? row
                    : {
                        ...row,
                        classes: row.classes.map((gate) =>
                          gate.classId !== classId ? gate : { ...gate, teacherOpen: open, open },
                        ),
                      },
                ),
              }
            : current,
        );
      } catch (caught) {
        setError(describeApiError(caught));
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (!isStaff) {
    return (
      <AppPageLayout className="admin-page">
        <main className="not-found" role="status">
          <p className="eyebrow">管理 / 无权访问</p>
          <h1>只有教师可以打开实验管理</h1>
        </main>
      </AppPageLayout>
    );
  }

  const classNames = new Map((data?.classes ?? []).map((klass) => [klass.id, klass.name]));

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="labs-page-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / 实验</p>
          <h1 id="labs-page-title">实验管理</h1>
          <p>选择每个实验是否对你任课的班级开放。</p>
        </section>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        {catalogWarning ? (
          <p className="auth-error" role="status">
            {catalogWarning}
          </p>
        ) : null}

        <div className="admin-grid admin-grid-single">
          <section className="profile-card" aria-labelledby="labs-title">
            <div className="profile-card-heading">
              <p className="eyebrow">LABS</p>
              <h2 id="labs-title">班级开放开关</h2>
            </div>
            <p className="admin-labs-hint">
              隐藏和班级范围由管理员决定；你只能关掉或放开自己任课的班级，学生立即受影响。
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">实验</th>
                  <th scope="col">关卡数</th>
                  <th scope="col">状态</th>
                  <th scope="col">我的班级</th>
                </tr>
              </thead>
              <tbody>
                {data?.labs.map((lab) => {
                  const openCount = lab.classes.filter((gate) => gate.open).length;
                  return (
                    <tr key={lab.id}>
                      <td>
                        {LAB_TITLES[lab.id] ?? lab.id}
                        <span className="admin-lab-id">{lab.id}</span>
                      </td>
                      <td>{lab.stageCount}</td>
                      <td>
                        <span className="admin-lab-state">
                          {lab.serverRegistered ? `${openCount} 个班开放` : "待服务器同步"}
                        </span>
                      </td>
                      <td className="admin-lab-config">
                        {!lab.serverRegistered ? (
                          <span>服务器尚未注册此实验，暂不能修改开放设置。</span>
                        ) : (
                          <div className="admin-lab-classes">
                            {lab.classes.map((gate) => (
                              <label
                                className="admin-lab-class"
                                key={gate.classId}
                                title={
                                  gate.adminAllowed
                                    ? undefined
                                    : "管理员未勾选这个班，勾选即对本班学生开放"
                                }
                              >
                                <input
                                  checked={gate.teacherOpen}
                                  disabled={busy.has(gateKey(lab.id, gate.classId))}
                                  onChange={() => void toggle(lab, gate.classId, !gate.teacherOpen)}
                                  type="checkbox"
                                />
                                {classNames.get(gate.classId) ?? gate.classId}
                              </label>
                            ))}
                            {lab.classes.length === 0 ? (
                              <span className="admin-lab-class-empty">
                                你还没有任课的班级，请管理员把你加入班级。
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data === null ? (
                  <tr>
                    <td colSpan={4}>正在加载实验…</td>
                  </tr>
                ) : data.labs.length === 0 ? (
                  <tr>
                    <td colSpan={4}>还没有实验。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </AppPageLayout>
  );
}
