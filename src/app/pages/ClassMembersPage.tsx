import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./admin.css";
import "./dashboard.css";

type Member = { userId: string; studentNo: string; name: string };

type MembersPayload = {
  classId: string;
  className: string;
  students: Member[];
  teachers: Member[];
};

type RemoveTarget = { label: string; description: string; userId: string };

type Banner = { classId: string; text: string };

const MIN_STUDENT_PASSWORD = 4;

export function ClassMembersPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const navigate = useNavigate();
  const { status, session } = useAuth();
  const [payload, setPayload] = useState<MembersPayload | null>(null);
  const [error, setError] = useState<Banner | null>(null);
  const [notice, setNotice] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [addStudentNo, setAddStudentNo] = useState("");
  const [newStudentNo, setNewStudentNo] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const teachable = (session?.memberships ?? []).filter((m) => m.role === "teacher");
  const canManage = status === "authenticated" && teachable.some((m) => m.classId === classId);

  const reload = useCallback(() => {
    if (!classId) return;
    void api
      .get<MembersPayload>(`/api/classes/${classId}/members`)
      .then((data) => {
        setPayload(data);
        setError(null);
      })
      .catch((caught) => {
        setPayload(null);
        setError({ classId, text: describeApiError(caught) });
      });
  }, [classId]);

  useEffect(() => {
    setPayload(null);
    setError(null);
    setNotice(null);
    setRenameTarget(null);
    setResetTarget(null);
    setRemoveTarget(null);
  }, [classId]);

  useEffect(() => {
    if (status === "authenticated" && canManage) reload();
  }, [status, canManage, reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        await action();
        reload();
      } catch (caught) {
        if (classId) setError({ classId, text: describeApiError(caught) });
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const submitAddExisting = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const studentNo = addStudentNo.trim();
      void run(async () => {
        await api.post(`/api/classes/${classId}/members`, { studentNo });
        setAddStudentNo("");
        if (classId) setNotice({ classId, text: `已把学生 ${studentNo} 加入班级。` });
      });
    },
    [addStudentNo, classId, run],
  );

  const submitCreate = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = newName.trim();
      void run(async () => {
        await api.post(`/api/classes/${classId}/members/students`, {
          studentNo: newStudentNo,
          name,
          password: newPassword,
        });
        setNewStudentNo("");
        setNewName("");
        setNewPassword("");
        if (classId)
          setNotice({ classId, text: `已创建学生账号 ${newStudentNo}（${name}）并加入班级。` });
      });
    },
    [classId, newName, newPassword, newStudentNo, run],
  );

  const submitRename = useCallback(
    (member: Member) => {
      const name = renameValue.trim();
      void run(async () => {
        await api.patch(`/api/classes/${classId}/members/${member.userId}`, { name });
        setRenameTarget(null);
        setRenameValue("");
        if (classId) setNotice({ classId, text: `已把 ${member.studentNo} 改名为 ${name}。` });
      });
    },
    [classId, renameValue, run],
  );

  const submitReset = useCallback(
    (member: Member) => {
      const password = resetPassword;
      void run(async () => {
        await api.put(`/api/classes/${classId}/members/${member.userId}/password`, { password });
        setResetTarget(null);
        setResetPassword("");
        if (classId)
          setNotice({ classId, text: `已重置 ${member.name} 的密码，其登录会话已失效。` });
      });
    },
    [classId, resetPassword, run],
  );

  const confirmRemove = useCallback(() => {
    if (!removeTarget) return;
    const target = removeTarget;
    void run(async () => {
      await api.del(`/api/classes/${classId}/members/${target.userId}`);
      setRemoveTarget(null);
      if (classId)
        setNotice({ classId, text: `已把${target.label}移出班级，账号和做题记录保留。` });
    });
  }, [classId, removeTarget, run]);

  const selectClass = useCallback(
    (nextClassId: string) => {
      void navigate({
        params: { classId: nextClassId },
        to: "/classes/$classId/members",
      });
    },
    [navigate],
  );

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (!canManage) {
    return (
      <AppPageLayout className="admin-page">
        <main className="not-found" role="status">
          <p className="eyebrow">班级管理 / 无权访问</p>
          <h1>只有任课教师或管理员可以管理班级成员</h1>
        </main>
      </AppPageLayout>
    );
  }

  const current = payload !== null && payload.classId === classId ? payload : null;
  const students = current?.students ?? [];
  const teachers = current?.teachers ?? [];

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="members-page-title">
        <section className="profile-intro">
          <p className="eyebrow">
            班级管理 /{" "}
            {teachable.find((m) => m.classId === classId)?.className ?? current?.className ?? ""}
          </p>
          <h1 id="members-page-title">班级成员</h1>
          <p>
            管理本班学生：加入或新建学生账号、改名、重置密码、移出班级。
            {teachers.length > 0 ? `任课教师：${teachers.map((t) => t.name).join("、")}。` : ""}
          </p>
          <div className="dashboard-controls">
            {teachable.length > 1 ? (
              <label className="field-select" htmlFor="members-class-select">
                <span>班级</span>
                <select
                  aria-label="选择班级"
                  id="members-class-select"
                  onChange={(event) => selectClass(event.target.value)}
                  value={classId ?? ""}
                >
                  {teachable.map((membership) => (
                    <option key={membership.classId} value={membership.classId}>
                      {membership.className}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {classId ? (
              <Link
                className="button button-ghost admin-inline-button"
                params={{ classId }}
                to="/classes/$classId/dashboard"
              >
                返回看板
              </Link>
            ) : null}
          </div>
        </section>

        {error && error.classId === classId ? (
          <p className="auth-error" role="alert">
            {error.text}
          </p>
        ) : null}
        {notice && notice.classId === classId ? (
          <p className="profile-success" role="status">
            {notice.text}
          </p>
        ) : null}

        <div className="admin-grid">
          <section className="profile-card" aria-labelledby="add-student-title">
            <div className="profile-card-heading">
              <p className="eyebrow">ENROLL</p>
              <h2 id="add-student-title">加入已有学生</h2>
            </div>
            <form className="profile-form" onSubmit={submitAddExisting}>
              <label>
                学生学号
                <input
                  autoComplete="off"
                  name="studentNo"
                  onChange={(e) => setAddStudentNo(e.target.value)}
                  placeholder="已有账号的学号"
                  required
                  value={addStudentNo}
                />
              </label>
              <button
                className="button button-primary"
                disabled={busy || addStudentNo.trim() === ""}
                type="submit"
              >
                加入班级
              </button>
            </form>
          </section>

          <section className="profile-card" aria-labelledby="create-student-title">
            <div className="profile-card-heading">
              <p className="eyebrow">CREATE</p>
              <h2 id="create-student-title">新建学生账号</h2>
            </div>
            <form className="profile-form" onSubmit={submitCreate}>
              <label>
                学号
                <input
                  autoComplete="off"
                  name="newStudentNo"
                  onChange={(e) => setNewStudentNo(e.target.value)}
                  required
                  value={newStudentNo}
                />
              </label>
              <label>
                姓名
                <input
                  autoComplete="off"
                  name="newName"
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  value={newName}
                />
              </label>
              <label>
                初始密码
                <input
                  autoComplete="off"
                  name="newPassword"
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`至少 ${MIN_STUDENT_PASSWORD} 位`}
                  required
                  value={newPassword}
                />
              </label>
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  newStudentNo.trim() === "" ||
                  newName.trim() === "" ||
                  newPassword.length < MIN_STUDENT_PASSWORD
                }
                type="submit"
              >
                创建并入班
              </button>
            </form>
          </section>

          <section className="profile-card admin-users-card" aria-labelledby="students-title">
            <div className="profile-card-heading">
              <p className="eyebrow">STUDENTS</p>
              <h2 id="students-title">本班学生（{students.length}）</h2>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">学号</th>
                  <th scope="col">姓名</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {students.map((member) => (
                  <tr key={member.userId}>
                    <td>{member.studentNo}</td>
                    <td>
                      {renameTarget === member.userId ? (
                        <form
                          className="admin-reset-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!busy && renameValue.trim() !== "") submitRename(member);
                          }}
                        >
                          <input
                            aria-label={`${member.name} 的新姓名`}
                            className="admin-reset-input"
                            disabled={busy}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={({ key, nativeEvent }) => {
                              if (
                                key === "Escape" &&
                                !nativeEvent.isComposing &&
                                nativeEvent.keyCode !== 229
                              ) {
                                setRenameTarget(null);
                                setRenameValue("");
                              }
                            }}
                            placeholder="新姓名"
                            value={renameValue}
                          />
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy || renameValue.trim() === ""}
                            type="submit"
                          >
                            确定
                          </button>
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={() => {
                              setRenameTarget(null);
                              setRenameValue("");
                            }}
                            type="button"
                          >
                            取消
                          </button>
                        </form>
                      ) : (
                        member.name
                      )}
                    </td>
                    <td>
                      {resetTarget === member.userId ? (
                        <form
                          className="admin-reset-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!busy && resetPassword.length >= MIN_STUDENT_PASSWORD) {
                              submitReset(member);
                            }
                          }}
                        >
                          <input
                            aria-label={`${member.name} 的新密码`}
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
                                setResetTarget(null);
                                setResetPassword("");
                              }
                            }}
                            placeholder={`新密码（至少 ${MIN_STUDENT_PASSWORD} 位）`}
                            type="password"
                            value={resetPassword}
                          />
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy || resetPassword.length < MIN_STUDENT_PASSWORD}
                            type="submit"
                          >
                            确定
                          </button>
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={() => {
                              setResetTarget(null);
                              setResetPassword("");
                            }}
                            type="button"
                          >
                            取消
                          </button>
                        </form>
                      ) : renameTarget === member.userId ? null : (
                        <span className="admin-actions">
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={() => {
                              setRenameTarget(member.userId);
                              setRenameValue(member.name);
                              setResetTarget(null);
                            }}
                            title="修改该学生的姓名"
                            type="button"
                          >
                            改名
                          </button>
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={() => {
                              setResetTarget(member.userId);
                              setResetPassword("");
                              setRenameTarget(null);
                            }}
                            title="重置该学生的密码，其登录会话将失效"
                            type="button"
                          >
                            重置密码
                          </button>
                          <button
                            className="button button-ghost admin-inline-button admin-danger"
                            disabled={busy}
                            onClick={() =>
                              setRemoveTarget({
                                label: `学生「${member.name}（${member.studentNo}）」`,
                                description:
                                  "移出后他将看不到本班的实验和任务单；账号、其他班级和做题记录都保留。",
                                userId: member.userId,
                              })
                            }
                            title="把该学生移出本班（账号保留）"
                            type="button"
                          >
                            移出班级
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {current !== null && students.length === 0 ? (
                  <tr>
                    <td colSpan={3}>还没有学生加入这个班级。</td>
                  </tr>
                ) : null}
                {current === null ? (
                  <tr>
                    <td colSpan={3}>正在加载名单…</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        {removeTarget ? (
          <div className="admin-modal-backdrop" role="presentation">
            <section
              aria-labelledby="member-remove-title"
              aria-modal="true"
              className="admin-modal"
              role="dialog"
            >
              <p className="eyebrow">确认操作</p>
              <h2 id="member-remove-title">确定把{removeTarget.label}移出班级？</h2>
              <p>{removeTarget.description}</p>
              <div className="admin-modal-actions">
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setRemoveTarget(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="button button-danger"
                  disabled={busy}
                  onClick={confirmRemove}
                  type="button"
                >
                  {busy ? "处理中…" : "确认移出"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppPageLayout>
  );
}
