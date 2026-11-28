import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { api } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import {
  LAB_IDS,
  LAB_CATEGORY_LABELS,
  labMetadata,
  type LabCategory,
  type LabId,
  type LabMetadataEntry,
} from "../../shared/lab/labMetadata";
import { getRecentLab } from "../../shared/lab/recentLab";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink } from "../../shared/ui/AppLink";
import { Icon } from "../../shared/ui/Icon";
import { SegmentedPicker } from "../../shared/ui/SegmentedPicker";
import { APP_LABS, type AppLabEntry } from "../labRegistry";
import { AtlasPlate } from "../atlas/AtlasPlate";
import { FeaturedLabDeck } from "../atlas/FeaturedLabDeck";
import "./home.css";

type ProjectSummary = { currentStage: number };

type StudentTask = {
  id: string;
  title: string;
  dueAt: string | null;
  status: "not_started" | "in_progress" | "submitted" | "reviewed" | "returned";
  finalScore: number | null;
  finalTotal: number | null;
};

const CATEGORY_ORDER: readonly LabCategory[] = [
  "computer-architecture",
  "data-encoding",
  "information-systems",
  "artificial-intelligence",
];

const SHOWCASE_LABS = [
  "image-sampling",
  "calculator",
  "lunch-shift",
  "logistic-regression",
] as const satisfies readonly LabId[];

const HOME_LABS = LAB_IDS.map((id, index) => {
  const meta: LabMetadataEntry = labMetadata[id];
  const appLab: AppLabEntry = APP_LABS[id];
  return {
    id,
    index: index + 1,
    ...meta,
    stages: appLab.homeProgressStages,
    defaultHidden: meta.defaultHidden ?? false,
  };
});

const TASK_STATUS: Record<StudentTask["status"], string> = {
  not_started: "未开始",
  in_progress: "进行中",
  submitted: "已提交",
  reviewed: "已批改",
  returned: "待重做",
};

function StudentTasks(props: { classId: string }) {
  const [tasks, setTasks] = createSignal<StudentTask[] | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [attempt, setAttempt] = createSignal(0);

  const fetchKey = createMemo(() => `${props.classId}:${attempt()}`);
  createEffect(fetchKey, () => {
    const classId = props.classId;
    let active = true;
    void api
      .get<{ assignments: StudentTask[] }>(`/api/classes/${classId}/task-assignments`)
      .then((p) => {
        if (active) setTasks(p.assignments);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  });

  const pending = createMemo(
    () =>
      (tasks() ?? []).filter((task) => task.status !== "reviewed" && task.status !== "submitted")
        .length,
  );

  return (
    <Switch
      fallback={
        <aside aria-labelledby="tasks-title" class="home-tasks-panel">
          <div class="home-tasks-heading">
            <h2 id="tasks-title">任务单</h2>
            <span class="home-count">{pending()} 待完成</span>
          </div>
          <div class="home-task-list">
            <For each={tasks() ?? []}>
              {(task) => {
                const actionText =
                  task.status === "reviewed"
                    ? "查看批改"
                    : task.status === "submitted"
                      ? "查看提交"
                      : task.status === "in_progress"
                        ? "继续作答"
                        : task.status === "returned"
                          ? "重新作答"
                          : "开始作答";
                return (
                  <article class="home-task">
                    <div class="home-task-copy">
                      <span class={`ts-task-badge ${task.status}`}>{TASK_STATUS[task.status]}</span>
                      <h3>{task.title}</h3>
                      <p>
                        {task.dueAt
                          ? `截止 ${new Date(task.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                          : "无截止时间"}
                        {task.status === "reviewed" && task.finalScore !== null
                          ? ` · ${task.finalScore}/${task.finalTotal} 分`
                          : ""}
                      </p>
                    </div>
                    <AppLink
                      aria-label={`${actionText}：${task.title}`}
                      class="home-task-action"
                      href={`/classes/${props.classId}/tasks/${task.id}`}
                    >
                      {actionText}
                      <Icon name="arrow-right" size={14} />
                    </AppLink>
                  </article>
                );
              }}
            </For>
          </div>
        </aside>
      }
    >
      <Match when={failed()}>
        <div class="home-task-notice">
          <span role="alert">任务单暂时无法载入。</span>
          <Button
            class="button button-secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
            type="button"
          >
            重试任务单
          </Button>
        </div>
      </Match>
      <Match when={!tasks() || tasks()!.length === 0}>
        <p class="home-task-notice" role="status">
          {tasks() ? "老师尚未布置任务单。" : "正在载入任务单…"}
        </p>
      </Match>
    </Switch>
  );
}

function AnonymousLanding() {
  return (
    <AppPageLayout class="home-page" topbarProps={{ showAccount: false, showHomeLink: false }}>
      <main class="page-content">
        <section aria-labelledby="home-title" class="home-hero">
          <div class="home-hero-copy">
            <p class="eyebrow">校内信息技术实验</p>
            <h1 id="home-title">计算实验室</h1>
            <p class="home-lede">
              搭一段逻辑电路、拆开一张位图文件头、训练一个垃圾短信分类器——在浏览器里亲手观察计算机如何处理眼前的信息。
            </p>
            <div class="home-hero-actions">
              <AppLink class="button button-primary" href="/login">
                登录 <Icon name="arrow-right" size={14} />
              </AppLink>
            </div>
          </div>
          <div class="home-hero-showcase">
            <FeaturedLabDeck labs={SHOWCASE_LABS} />
          </div>
        </section>
      </main>
    </AppPageLayout>
  );
}

function StageProgress(props: { done: number; total: number }) {
  return (
    <div class="progress-block">
      <div
        aria-label={`已完成 ${props.done} / ${props.total} 关`}
        aria-valuemax={props.total}
        aria-valuemin={0}
        aria-valuenow={props.done}
        class="progress-track"
        role="progressbar"
      >
        <span class="progress-fill" style={{ width: `${(props.done / props.total) * 100}%` }} />
      </div>
    </div>
  );
}

function ClassroomHome() {
  const auth = useAuth();
  const catalog = useLabCatalog(() => auth.status === "authenticated");
  const [projects, setProjects] = createSignal<Record<string, ProjectSummary | null>>({});
  const [activeCategory, setActiveCategory] = createSignal<LabCategory | "all">("all");

  const classId = createMemo(() => auth.primaryMembership?.classId);
  const isStaff = createMemo(() => isStaffRole(auth.role));
  const isAdmin = createMemo(() => auth.role === "admin");
  const studentId = createMemo(() => (!isStaff() ? auth.session?.user.id : undefined));
  const recentVisit = createMemo(() => {
    const id = studentId();
    return id ? getRecentLab(id) : null;
  });

  const entryOf = (labId: LabId) => catalog()?.get(labId);
  const cardVisible = (lab: (typeof HOME_LABS)[number]) => {
    if (isAdmin()) return true;
    const entry = entryOf(lab.id);
    if (lab.defaultHidden) return entry?.visible === true;
    return entry?.visible !== false;
  };
  const adminBadge = (labId: LabId) => {
    if (!isAdmin()) return null;
    const entry = entryOf(labId);
    if (entry?.hidden) return { label: "已隐藏", tone: "hidden" as const };
    if (entry?.openClassIds) {
      return { label: `${entry.openClassIds.length} 个班可见`, tone: "scoped" as const };
    }
    return null;
  };

  const visibleLabs = createMemo(() => (catalog() ? HOME_LABS.filter(cardVisible) : []));
  const presentCategories = createMemo(() =>
    CATEGORY_ORDER.filter((category) => visibleLabs().some((lab) => lab.category === category)),
  );
  const effectiveCategory = createMemo(() =>
    activeCategory() !== "all" && presentCategories().includes(activeCategory() as LabCategory)
      ? activeCategory()
      : "all",
  );
  const displayedLabs = createMemo(() =>
    effectiveCategory() === "all"
      ? visibleLabs()
      : visibleLabs().filter((lab) => lab.category === effectiveCategory()),
  );

  const recentClassId = createMemo(() => {
    const visit = recentVisit();
    return visit && entryOf(visit.labId)?.visibleClassIds?.includes(visit.classId)
      ? visit.classId
      : undefined;
  });
  const recentLab = createMemo(() =>
    recentClassId() ? visibleLabs().find((lab) => lab.id === recentVisit()?.labId) : undefined,
  );
  const recentLabId = createMemo(() => recentLab()?.id);

  const labHref = (labId: LabId) =>
    labId === recentLabId() && recentClassId()
      ? `/classes/${recentClassId()}/labs/${labId}`
      : `/labs/${labId}`;

  const progressOf = (lab: (typeof HOME_LABS)[number]) => {
    const project = projects()[lab.id];
    if (isStaff() || !project || lab.stages === null) return null;
    return { done: Math.max(0, Math.min(project.currentStage - 1, lab.stages)), total: lab.stages };
  };

  const resumeRecent = createMemo(() => {
    const recent = recentLab();
    if (!recent) return null;
    const recentProgress = progressOf(recent);
    return recent.stages === null || (recentProgress && recentProgress.done < recentProgress.total)
      ? recent
      : null;
  });

  const resumeLab = createMemo(() => {
    if (isStaff() || !classId()) return null;
    const recent = recentLab();
    const pendingRecent = recent && projects()[recent.id] === undefined;
    return (
      resumeRecent() ??
      (!pendingRecent
        ? visibleLabs().find((lab) => {
            const progress = progressOf(lab);
            return progress && progress.done > 0 && progress.done < progress.total;
          })
        : null) ??
      null
    );
  });

  const resumeProgress = createMemo(() => {
    const lab = resumeLab();
    return lab ? progressOf(lab) : null;
  });

  const projectFetchTargets = createMemo(() => {
    const cid = classId();
    const cat = catalog();
    if (!cid || isStaff() || cat === null) return [];
    const recentId = recentLabId();
    const recentCid = recentClassId();
    return HOME_LABS.flatMap((lab) => {
      const entry = entryOf(lab.id);
      if (lab.stages === null || !cardVisible(lab)) return [];
      const projectClassId =
        (lab.id === recentId ? recentCid : undefined) ?? entry?.visibleClassIds?.[0] ?? cid;
      return [{ labId: lab.id, projectClassId }];
    });
  });

  const projectFetchKey = createMemo(() =>
    projectFetchTargets()
      .map((item) => `${item.labId}@${item.projectClassId}`)
      .join(","),
  );

  createEffect(
    () => {
      projectFetchKey();
      return projectFetchTargets();
    },
    (targets) => {
      for (const { labId, projectClassId } of targets) {
        void api
          .get<ProjectSummary>(`/api/classes/${projectClassId}/labs/${labId}/project`)
          .then((project) => setProjects((current) => ({ ...current, [labId]: project })))
          .catch(() => setProjects((current) => ({ ...current, [labId]: null })));
      }
    },
  );

  return (
    <AppPageLayout class="home-page" topbarProps={{ showHomeLink: false }}>
      <main class="page-content">
        <div class="home-header">
          <div class="home-header-main">
            <Show when={auth.primaryMembership}>
              {(membership) => <p class="home-context">{membership().className}</p>}
            </Show>
            <div class="home-title-row">
              <h1 id="current-title">实验课程</h1>
              <Show when={catalog()}>
                <span class="home-count">
                  {visibleLabs().length} 项实验 · {presentCategories().length} 个主题
                </span>
              </Show>
            </div>
          </div>

          <Show when={resumeLab()}>
            {(lab) => (
              <AppLink
                class="home-resume-card"
                data-category={lab().category}
                href={labHref(lab().id)}
              >
                <div class="home-resume-meta">
                  <span class="home-resume-label">
                    {resumeRecent() ? "继续上次实验" : "继续未完成实验"}
                  </span>
                  <strong>{lab().title}</strong>
                  <Show when={resumeProgress()}>
                    {(progress) => (
                      <span>
                        已通过 {progress().done} / {progress().total} 关
                      </span>
                    )}
                  </Show>
                </div>
                <span class="home-resume-cta">
                  继续 <Icon name="arrow-right" size={14} />
                </span>
              </AppLink>
            )}
          </Show>
        </div>

        <Show when={catalog() && presentCategories().length > 1}>
          <SegmentedPicker
            class="home-filter-bar"
            itemClass="home-filter-pill"
            label="按主题筛选"
            onChange={setActiveCategory}
            options={[
              {
                value: "all" as LabCategory | "all",
                label: (
                  <>
                    全部
                    <span class="home-filter-count">{visibleLabs().length}</span>
                  </>
                ),
              },
              ...presentCategories().map((category) => ({
                value: category as LabCategory | "all",
                label: (
                  <>
                    <span aria-hidden="true" class="topic-dot" />
                    {LAB_CATEGORY_LABELS[category]}
                    <span class="home-filter-count">
                      {visibleLabs().filter((lab) => lab.category === category).length}
                    </span>
                  </>
                ),
                data: { "data-category": category },
              })),
            ]}
            value={effectiveCategory()}
          />
        </Show>

        <div class="home-content-grid">
          <section aria-labelledby="current-title" class="current-lab-section" id="lab-catalog">
            <div class="lab-card-grid lab-catalog-grid">
              <For each={displayedLabs()}>
                {(lab) => {
                  const project = () => projects()[lab.id];
                  const badge = () => adminBadge(lab.id);
                  const stageProgress = () => progressOf(lab);
                  const completed = () => {
                    const p = stageProgress();
                    return p !== null && p.done >= p.total;
                  };

                  return (
                    <article
                      class={`lab-card${classId() ? " is-interactive" : ""}`}
                      data-category={lab.category}
                    >
                      <AtlasPlate labId={lab.id} />
                      <div class="lab-card-topline">
                        <div class="lab-card-meta">
                          <span class="lab-card-index">{String(lab.index).padStart(2, "0")}</span>
                          <span aria-hidden="true" class="topic-dot" />
                          <span class="category-label">{LAB_CATEGORY_LABELS[lab.category]}</span>
                        </div>
                        <Show
                          fallback={
                            <Show when={stageProgress()}>
                              {(progress) => (
                                <span
                                  class={`lab-card-badge${completed() ? " is-done" : progress().done > 0 ? " is-progress" : ""}`}
                                >
                                  <Show
                                    fallback={`${progress().done} / ${progress().total} 关`}
                                    when={completed()}
                                  >
                                    <Icon name="check" size={11} /> 已通关
                                  </Show>
                                </span>
                              )}
                            </Show>
                          }
                          when={badge()}
                        >
                          {(b) => <span class={`lab-card-badge is-${b().tone}`}>{b().label}</span>}
                        </Show>
                      </div>
                      <h3>{lab.title}</h3>
                      <p class="lab-card-desc">{lab.description}</p>
                      <div class="lab-card-footer">
                        <Show when={stageProgress()}>
                          {(progress) => (
                            <StageProgress done={progress().done} total={progress().total} />
                          )}
                        </Show>
                        <Show
                          fallback={<p class="lab-card-locked">请先加入班级，再开始实验。</p>}
                          when={classId()}
                        >
                          <AppLink class="lab-card-action" href={labHref(lab.id)}>
                            <span>
                              {lab.id === recentLabId() ||
                              (project() && project()!.currentStage > 1)
                                ? "继续"
                                : "开始实验"}
                            </span>
                            <Icon name="arrow-right" size={14} />
                          </AppLink>
                        </Show>
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
            <Switch>
              <Match when={!catalog()}>
                <p class="home-status" role="status">
                  正在载入实验目录…
                </p>
              </Match>
              <Match when={!visibleLabs().length}>
                <p class="home-empty">当前没有开放的实验，等管理员开放后再来。</p>
              </Match>
            </Switch>
          </section>
          <Show keyed when={classId() && !isStaff() ? classId() : undefined}>
            {(cid) => <StudentTasks classId={cid} />}
          </Show>
        </div>
      </main>
    </AppPageLayout>
  );
}

export function HomePage() {
  const auth = useAuth();
  return (
    <Switch fallback={<AnonymousLanding />}>
      <Match when={auth.status === "loading"}>
        <AppPageLayout class="home-page" topbarProps={{ showHomeLink: false }}>
          <main class="page-content">
            <p class="home-loading" role="status">
              正在载入…
            </p>
          </main>
        </AppPageLayout>
      </Match>
      <Match when={auth.status === "authenticated"}>
        <ClassroomHome />
      </Match>
    </Switch>
  );
}
