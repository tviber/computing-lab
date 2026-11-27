import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { LAB_TITLES, type LabVisibility, type TeacherLabView } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Redirect } from "../../shared/ui/AppLink";
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
  const auth = useAuth();
  const isStaff = createMemo(() => isStaffRole(auth.role));
  const [data, setData] = createSignal<TeacherLabData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [catalogWarning, setCatalogWarning] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal<Set<string>>(new Set());

  const fetchKey = createMemo(() => (auth.status === "authenticated" && isStaff() ? "load" : ""));

  createEffect(fetchKey, (key) => {
    if (!key) return;
    let active = true;
    void Promise.allSettled([
      api.get<TeacherLabPayload>("/api/teacher/labs"),
      api.get<{ labs: LabVisibility[] }>("/api/labs"),
    ]).then(([teacherResult, catalogResult]) => {
      if (!active) return;
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
    return () => {
      active = false;
    };
  });

  const toggle = async (lab: TeacherLabCatalogEntry, classId: string, open: boolean) => {
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
  };

  const classNames = createMemo(
    () => new Map((data()?.classes ?? []).map((klass) => [klass.id, klass.name])),
  );
  const labIds = createMemo(() => (data()?.labs ?? []).map((lab) => lab.id));
  const labsById = createMemo(() => new Map((data()?.labs ?? []).map((lab) => [lab.id, lab])));

  return (
    <Switch
      fallback={
        <AppPageLayout class="admin-page">
          <main aria-labelledby="labs-page-title" class="page-content profile-main">
            <section class="profile-intro">
              <p class="eyebrow">管理 / 实验</p>
              <h1 id="labs-page-title">实验管理</h1>
              <p>选择每个实验是否对你任课的班级开放。</p>
            </section>
            <Show when={error()}>
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
                  <h2 id="labs-title">班级开放开关</h2>
                </div>
                <p class="admin-labs-hint">
                  隐藏和班级范围由管理员决定；你只能关掉或放开自己任课的班级，学生立即受影响。
                </p>
                <div
                  aria-label="实验列表"
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
                        <th scope="col">我的班级</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={labIds()}>
                        {(labId) => {
                          const lab = () => labsById().get(labId)!;
                          const openCount = () => lab().classes.filter((gate) => gate.open).length;
                          const gateClassIds = createMemo(() =>
                            lab().classes.map((gate) => gate.classId),
                          );
                          const gatesByClassId = createMemo(
                            () => new Map(lab().classes.map((gate) => [gate.classId, gate])),
                          );
                          return (
                            <tr>
                              <td>
                                {LAB_TITLES[labId] ?? labId}
                                <span class="admin-lab-id">{labId}</span>
                              </td>
                              <td>{lab().stageCount}</td>
                              <td>
                                <span class="admin-lab-state">
                                  {lab().serverRegistered
                                    ? `${openCount()} 个班开放`
                                    : "待服务器同步"}
                                </span>
                              </td>
                              <td class="admin-lab-config">
                                <Show
                                  fallback={<span>服务器尚未注册此实验，暂不能修改开放设置。</span>}
                                  when={lab().serverRegistered}
                                >
                                  <div class="admin-lab-classes">
                                    <For each={gateClassIds()}>
                                      {(gateClassId) => {
                                        const gate = () => gatesByClassId().get(gateClassId)!;
                                        return (
                                          <label
                                            class="admin-lab-class"
                                            title={
                                              gate().adminAllowed
                                                ? undefined
                                                : "管理员未勾选这个班，勾选即对本班学生开放"
                                            }
                                          >
                                            <input
                                              checked={gate().teacherOpen}
                                              disabled={busy().has(gateKey(labId, gateClassId))}
                                              onChange={(event) => {
                                                const currentOpen = gate().teacherOpen;
                                                event.currentTarget.checked = currentOpen;
                                                void toggle(lab(), gateClassId, !currentOpen);
                                              }}
                                              type="checkbox"
                                            />
                                            {classNames().get(gateClassId) ?? gateClassId}
                                          </label>
                                        );
                                      }}
                                    </For>
                                    <Show when={lab().classes.length === 0}>
                                      <span class="admin-lab-class-empty">
                                        你还没有任课的班级，请管理员把你加入班级。
                                      </span>
                                    </Show>
                                  </div>
                                </Show>
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                      <Switch>
                        <Match when={data() === null}>
                          <tr>
                            <td colspan={4}>正在加载实验…</td>
                          </tr>
                        </Match>
                        <Match when={data()?.labs.length === 0}>
                          <tr>
                            <td colspan={4}>还没有实验。</td>
                          </tr>
                        </Match>
                      </Switch>
                    </tbody>
                  </table>
                </div>
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
      <Match when={!isStaff()}>
        <AppPageLayout class="admin-page">
          <main class="not-found" role="status">
            <p class="eyebrow">管理 / 无权访问</p>
            <h1>只有教师可以打开实验管理</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
