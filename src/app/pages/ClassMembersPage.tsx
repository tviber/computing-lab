import { useNavigate, useParams } from "@solidjs/router";
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
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink, Redirect } from "../../shared/ui/AppLink";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
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
  const params = useParams<{ classId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [payload, setPayload] = createSignal<MembersPayload | null>(null);
  const [error, setError] = createSignal<Banner | null>(null);
  const [notice, setNotice] = createSignal<Banner | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [renameTarget, setRenameTarget] = createSignal<string | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [resetTarget, setResetTarget] = createSignal<string | null>(null);
  const [resetPassword, setResetPassword] = createSignal("");
  const [removeTarget, setRemoveTarget] = createSignal<RemoveTarget | null>(null);
  const [addStudentNo, setAddStudentNo] = createSignal("");
  const [newStudentNo, setNewStudentNo] = createSignal("");
  const [newName, setNewName] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [reloadTick, setReloadTick] = createSignal(0);

  const classId = createMemo(() => params.classId);
  const teachable = createMemo(() =>
    (auth.session?.memberships ?? []).filter((m) => m.role === "teacher"),
  );
  const canManage = createMemo(
    () => auth.status === "authenticated" && teachable().some((m) => m.classId === classId()),
  );

  const reload = () => setReloadTick((n) => n + 1);

  createEffect(classId, () => {
    setPayload(null);
    setError(null);
    setNotice(null);
    setRenameTarget(null);
    setResetTarget(null);
    setRemoveTarget(null);
  });

  const fetchKey = createMemo(() => {
    const cid = classId();
    return auth.status === "authenticated" && canManage() && cid ? `${cid}\0${reloadTick()}` : "";
  });

  createEffect(fetchKey, (key) => {
    if (!key) return;
    const cid = untrack(classId);
    if (!cid) return;
    let active = true;
    void api
      .get<MembersPayload>(`/api/classes/${cid}/members`)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setPayload(null);
        setError({ classId: cid, text: describeApiError(caught) });
      });
    return () => {
      active = false;
    };
  });

  const run = async (action: () => Promise<unknown>) => {
    const cid = classId();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      reload();
    } catch (caught) {
      if (cid) setError({ classId: cid, text: describeApiError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const submitAddExisting = (event: SubmitEvent) => {
    event.preventDefault();
    const cid = classId();
    const studentNo = addStudentNo().trim();
    if (!cid) return;
    void run(async () => {
      await api.post(`/api/classes/${cid}/members`, { studentNo });
      setAddStudentNo("");
      setNotice({ classId: cid, text: `已把学生 ${studentNo} 加入班级。` });
    });
  };

  const submitCreate = (event: SubmitEvent) => {
    event.preventDefault();
    const cid = classId();
    const studentNo = newStudentNo();
    const name = newName().trim();
    const password = newPassword();
    if (!cid) return;
    void run(async () => {
      await api.post(`/api/classes/${cid}/members/students`, {
        studentNo,
        name,
        password,
      });
      setNewStudentNo("");
      setNewName("");
      setNewPassword("");
      setNotice({ classId: cid, text: `已创建学生账号 ${studentNo}（${name}）并加入班级。` });
    });
  };

  const submitRename = (member: Member) => {
    const cid = classId();
    const name = renameValue().trim();
    if (!cid) return;
    void run(async () => {
      await api.patch(`/api/classes/${cid}/members/${member.userId}`, { name });
      setRenameTarget(null);
      setRenameValue("");
      setNotice({ classId: cid, text: `已把 ${member.studentNo} 改名为 ${name}。` });
    });
  };

  const submitReset = (member: Member) => {
    const cid = classId();
    const password = resetPassword();
    if (!cid) return;
    void run(async () => {
      await api.put(`/api/classes/${cid}/members/${member.userId}/password`, { password });
      setResetTarget(null);
      setResetPassword("");
      setNotice({ classId: cid, text: `已重置 ${member.name} 的密码，其登录会话已失效。` });
    });
  };

  const confirmRemove = async () => {
    const target = removeTarget();
    const cid = classId();
    if (!target || !cid) return;
    setError(null);
    setNotice(null);
    await api.del(`/api/classes/${cid}/members/${target.userId}`);
    setRemoveTarget(null);
    setNotice({ classId: cid, text: `已把${target.label}移出班级，账号和做题记录保留。` });
    reload();
  };

  const selectClass = (nextClassId: string) => {
    navigate(`/classes/${nextClassId}/members`);
  };

  const current = createMemo(() => {
    const p = payload();
    const cid = classId();
    return p !== null && p.classId === cid ? p : null;
  });
  const students = createMemo(() => current()?.students ?? []);
  const teachers = createMemo(() => current()?.teachers ?? []);

  return (
    <Switch
      fallback={
        <AppPageLayout class="admin-page">
          <main aria-labelledby="members-page-title" class="page-content profile-main">
            <section class="profile-intro">
              <p class="eyebrow">
                班级管理 /{" "}
                {teachable().find((m) => m.classId === classId())?.className ??
                  current()?.className ??
                  ""}
              </p>
              <h1 id="members-page-title">班级成员</h1>
              <p>
                管理本班学生：加入或新建学生账号、改名、重置密码、移出班级。
                {teachers().length > 0
                  ? `任课教师：${teachers()
                      .map((t) => t.name)
                      .join("、")}。`
                  : ""}
              </p>
              <div class="dashboard-controls">
                <Show when={teachable().length > 1}>
                  <label class="field-select" for="members-class-select">
                    <span>班级</span>
                    <select
                      aria-label="选择班级"
                      id="members-class-select"
                      onChange={(event) => selectClass(event.currentTarget.value)}
                      value={classId() ?? ""}
                    >
                      <For each={teachable()}>
                        {(membership) => (
                          <option value={membership.classId}>{membership.className}</option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>
                <Show when={classId()}>
                  {(cid) => (
                    <AppLink
                      class="button button-ghost admin-inline-button"
                      href={`/classes/${cid()}/dashboard`}
                    >
                      返回看板
                    </AppLink>
                  )}
                </Show>
              </div>
            </section>

            <Show when={error() && error()!.classId === classId() ? error()!.text : null}>
              {(msg) => (
                <p class="auth-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>
            <Show when={notice() && notice()!.classId === classId() ? notice()!.text : null}>
              {(msg) => (
                <p class="profile-success" role="status">
                  {msg()}
                </p>
              )}
            </Show>

            <div class="admin-grid">
              <section aria-labelledby="add-student-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">ENROLL</p>
                  <h2 id="add-student-title">加入已有学生</h2>
                </div>
                <form class="profile-form" onSubmit={submitAddExisting}>
                  <label>
                    学生学号
                    <input
                      autocomplete="off"
                      name="studentNo"
                      onInput={(e) => setAddStudentNo(e.currentTarget.value)}
                      placeholder="已有账号的学号"
                      required
                      value={addStudentNo()}
                    />
                  </label>
                  <Button
                    class="button button-primary"
                    disabled={busy() || addStudentNo().trim() === ""}
                    type="submit"
                  >
                    加入班级
                  </Button>
                </form>
              </section>

              <section aria-labelledby="create-student-title" class="profile-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">CREATE</p>
                  <h2 id="create-student-title">新建学生账号</h2>
                </div>
                <form class="profile-form" onSubmit={submitCreate}>
                  <label>
                    学号
                    <input
                      autocomplete="off"
                      name="newStudentNo"
                      onInput={(e) => setNewStudentNo(e.currentTarget.value)}
                      required
                      value={newStudentNo()}
                    />
                  </label>
                  <label>
                    姓名
                    <input
                      autocomplete="off"
                      name="newName"
                      onInput={(e) => setNewName(e.currentTarget.value)}
                      required
                      value={newName()}
                    />
                  </label>
                  <label>
                    初始密码
                    <input
                      autocomplete="off"
                      name="newPassword"
                      onInput={(e) => setNewPassword(e.currentTarget.value)}
                      placeholder={`至少 ${MIN_STUDENT_PASSWORD} 位`}
                      required
                      value={newPassword()}
                    />
                  </label>
                  <Button
                    class="button button-primary"
                    disabled={
                      busy() ||
                      newStudentNo().trim() === "" ||
                      newName().trim() === "" ||
                      newPassword().length < MIN_STUDENT_PASSWORD
                    }
                    type="submit"
                  >
                    创建并入班
                  </Button>
                </form>
              </section>

              <section aria-labelledby="students-title" class="profile-card admin-users-card">
                <div class="profile-card-heading">
                  <p class="eyebrow">STUDENTS</p>
                  <h2 id="students-title">本班学生（{students().length}）</h2>
                </div>
                <div
                  aria-label="本班学生列表"
                  class="admin-account-table-scroll"
                  role="region"
                  tabindex={0}
                >
                  <table class="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">学号</th>
                        <th scope="col">姓名</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={students()} keyed={(item) => item.userId}>
                        {(member) => (
                          <tr>
                            <td>{member().studentNo}</td>
                            <td>
                              <Show
                                fallback={member().name}
                                when={renameTarget() === member().userId}
                              >
                                <form
                                  class="admin-reset-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!busy() && renameValue().trim() !== "")
                                      submitRename(member());
                                  }}
                                >
                                  <input
                                    aria-label={`${member().name} 的新姓名`}
                                    class="admin-reset-input"
                                    disabled={busy()}
                                    onInput={(e) => setRenameValue(e.currentTarget.value)}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Escape" &&
                                        !event.isComposing &&
                                        event.keyCode !== 229
                                      ) {
                                        setRenameTarget(null);
                                        setRenameValue("");
                                      }
                                    }}
                                    placeholder="新姓名"
                                    value={renameValue()}
                                  />
                                  <Button
                                    class="button button-ghost admin-inline-button"
                                    disabled={busy() || renameValue().trim() === ""}
                                    type="submit"
                                  >
                                    确定
                                  </Button>
                                  <Button
                                    class="button button-ghost admin-inline-button"
                                    disabled={busy()}
                                    onClick={() => {
                                      setRenameTarget(null);
                                      setRenameValue("");
                                    }}
                                    type="button"
                                  >
                                    取消
                                  </Button>
                                </form>
                              </Show>
                            </td>
                            <td>
                              <Switch
                                fallback={
                                  <span class="admin-actions">
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={busy()}
                                      onClick={() => {
                                        setRenameTarget(member().userId);
                                        setRenameValue(member().name);
                                        setResetTarget(null);
                                      }}
                                      title="修改该学生的姓名"
                                      type="button"
                                    >
                                      改名
                                    </Button>
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={busy()}
                                      onClick={() => {
                                        setResetTarget(member().userId);
                                        setResetPassword("");
                                        setRenameTarget(null);
                                      }}
                                      title="重置该学生的密码，其登录会话将失效"
                                      type="button"
                                    >
                                      重置密码
                                    </Button>
                                    <Button
                                      class="button button-ghost admin-inline-button admin-danger"
                                      disabled={busy()}
                                      onClick={() =>
                                        setRemoveTarget({
                                          label: `学生「${member().name}（${member().studentNo}）」`,
                                          description:
                                            "移出后他将看不到本班的实验和任务单；账号、其他班级和做题记录都保留。",
                                          userId: member().userId,
                                        })
                                      }
                                      title="把该学生移出本班（账号保留）"
                                      type="button"
                                    >
                                      移出班级
                                    </Button>
                                  </span>
                                }
                              >
                                <Match when={resetTarget() === member().userId}>
                                  <form
                                    class="admin-reset-form"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      if (
                                        !busy() &&
                                        resetPassword().length >= MIN_STUDENT_PASSWORD
                                      ) {
                                        submitReset(member());
                                      }
                                    }}
                                  >
                                    <input
                                      aria-label={`${member().name} 的新密码`}
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
                                          setResetTarget(null);
                                          setResetPassword("");
                                        }
                                      }}
                                      placeholder={`新密码（至少 ${MIN_STUDENT_PASSWORD} 位）`}
                                      type="password"
                                      value={resetPassword()}
                                    />
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={
                                        busy() || resetPassword().length < MIN_STUDENT_PASSWORD
                                      }
                                      type="submit"
                                    >
                                      确定
                                    </Button>
                                    <Button
                                      class="button button-ghost admin-inline-button"
                                      disabled={busy()}
                                      onClick={() => {
                                        setResetTarget(null);
                                        setResetPassword("");
                                      }}
                                      type="button"
                                    >
                                      取消
                                    </Button>
                                  </form>
                                </Match>
                                <Match when={renameTarget() === member().userId}>{null}</Match>
                              </Switch>
                            </td>
                          </tr>
                        )}
                      </For>
                      <Show when={current() !== null && students().length === 0}>
                        <tr>
                          <td colspan={3}>还没有学生加入这个班级。</td>
                        </tr>
                      </Show>
                      <Show when={current() === null}>
                        <tr>
                          <td colspan={3}>正在加载名单…</td>
                        </tr>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <Show when={removeTarget()}>
              {(target) => (
                <AdminConfirmDialog
                  confirmLabel="确认移出"
                  description={target().description}
                  onCancel={() => setRemoveTarget(null)}
                  onConfirm={confirmRemove}
                  pendingLabel="处理中…"
                  title={`确定把${target().label}移出班级？`}
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
      <Match when={!canManage()}>
        <AppPageLayout class="admin-page">
          <main class="not-found" role="status">
            <p class="eyebrow">班级管理 / 无权访问</p>
            <h1>只有任课教师或管理员可以管理班级成员</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
