import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Icon } from "../../shared/ui/Icon";
import { APP_LABS, type AppLabEntry } from "../labRegistry";
import { AtlasPlate } from "../atlas/AtlasPlate";
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

const SHOWCASE_LABS: readonly LabId[] = [
  "image-sampling",
  "calculator",
  "lunch-shift",
  "logistic-regression",
];

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

function StudentTasks({ classId }: { classId: string }) {
  const [tasks, setTasks] = useState<StudentTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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
  }, [classId, attempt]);

  if (failed)
    return (
      <div className="home-task-notice">
        <span role="alert">任务单暂时无法载入。</span>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          重试任务单
        </button>
      </div>
    );
  if (!tasks || tasks.length === 0)
    return (
      <p className="home-task-notice" role="status">
        {tasks ? "老师尚未布置任务单。" : "正在载入任务单…"}
      </p>
    );
  const pending = tasks.filter(
    (task) => task.status !== "reviewed" && task.status !== "submitted",
  ).length;
  return (
    <aside aria-labelledby="tasks-title" className="home-tasks-panel">
      <div className="home-tasks-heading">
        <h2 id="tasks-title">任务单</h2>
        <span className="home-count">{pending} 待完成</span>
      </div>
      <div className="home-task-list">
        {tasks.map((task) => {
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
            <article className="home-task" key={task.id}>
              <div className="home-task-copy">
                <span className={`ts-task-badge ${task.status}`}>{TASK_STATUS[task.status]}</span>
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
              <Link
                aria-label={`${actionText}：${task.title}`}
                className="home-task-action"
                params={{ assignmentId: task.id, classId }}
                to="/classes/$classId/tasks/$assignmentId"
              >
                {actionText}
                <Icon name="arrow-right" size={14} />
              </Link>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function AnonymousLanding() {
  const [previewLab, setPreviewLab] = useState<LabId>(SHOWCASE_LABS[0]);

  return (
    <AppPageLayout className="home-page" topbarProps={{ showAccount: false, showHomeLink: false }}>
      <main className="page-content">
        <section aria-labelledby="home-title" className="home-hero">
          <div className="home-hero-copy">
            <p className="eyebrow">校内信息技术实验</p>
            <h1 id="home-title">计算实验室</h1>
            <p className="home-lede">
              搭一段逻辑电路、拆开一张位图文件头、训练一个垃圾短信分类器——在浏览器里亲手观察计算机如何处理眼前的信息。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary" to="/login">
                登录 <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          </div>
          <div className="home-hero-showcase">
            <AtlasPlate featured labId={previewLab} />
            <div aria-label="切换实验示意" className="home-specimen-tabs" role="group">
              {SHOWCASE_LABS.map((labId) => {
                const meta = labMetadata[labId];
                const active = previewLab === labId;
                return (
                  <button
                    aria-pressed={active}
                    className={`home-specimen-tab${active ? " is-active" : ""}`}
                    data-category={meta.category}
                    key={labId}
                    onClick={() => setPreviewLab(labId)}
                    type="button"
                  >
                    <span aria-hidden="true" className="topic-dot" />
                    {meta.title}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </AppPageLayout>
  );
}

function StageProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="progress-block">
      <div
        aria-label={`已完成 ${done} / ${total} 关`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={done}
        className="progress-track"
        role="progressbar"
      >
        <span className="progress-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

function ClassroomHome() {
  const { status, primaryMembership, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [projects, setProjects] = useState<Record<string, ProjectSummary | null>>({});
  const [activeCategory, setActiveCategory] = useState<LabCategory | "all">("all");
  const classId = primaryMembership?.classId;
  const isStaff = isStaffRole(role);
  const isAdmin = role === "admin";
  const studentId = !isStaff ? session?.user.id : undefined;
  const recentVisit = studentId ? getRecentLab(studentId) : null;
  const entryOf = (labId: LabId) => catalog?.get(labId);
  const cardVisible = (lab: (typeof HOME_LABS)[number]) => {
    if (isAdmin) return true;
    const entry = entryOf(lab.id);
    if (lab.defaultHidden) return entry?.visible === true;
    return entry?.visible !== false;
  };
  const adminBadge = (labId: LabId) => {
    if (!isAdmin) return null;
    const entry = entryOf(labId);
    if (entry?.hidden) return { label: "已隐藏", tone: "hidden" as const };
    if (entry?.openClassIds) {
      return { label: `${entry.openClassIds.length} 个班可见`, tone: "scoped" as const };
    }
    return null;
  };

  const visibleLabs = catalog ? HOME_LABS.filter(cardVisible) : [];
  const presentCategories = CATEGORY_ORDER.filter((category) =>
    visibleLabs.some((lab) => lab.category === category),
  );
  const effectiveCategory =
    activeCategory !== "all" && presentCategories.includes(activeCategory) ? activeCategory : "all";
  const displayedLabs =
    effectiveCategory === "all"
      ? visibleLabs
      : visibleLabs.filter((lab) => lab.category === effectiveCategory);

  const recentClassId =
    recentVisit && entryOf(recentVisit.labId)?.visibleClassIds?.includes(recentVisit.classId)
      ? recentVisit.classId
      : undefined;
  const recentLab = recentClassId
    ? visibleLabs.find((lab) => lab.id === recentVisit?.labId)
    : undefined;
  const recentLabId = recentLab?.id;
  const labLink = (labId: LabId) =>
    labId === recentLabId && recentClassId
      ? { to: `/classes/$classId/labs/${labId}` as const, params: { classId: recentClassId } }
      : { to: `/labs/${labId}` as const };
  const progressOf = (lab: (typeof HOME_LABS)[number]) => {
    const project = projects[lab.id];
    if (isStaff || !project || lab.stages === null) return null;
    return { done: Math.max(0, Math.min(project.currentStage - 1, lab.stages)), total: lab.stages };
  };
  const recentProgress = recentLab ? progressOf(recentLab) : null;
  const resumeRecent =
    recentLab &&
    (recentLab.stages === null || (recentProgress && recentProgress.done < recentProgress.total))
      ? recentLab
      : null;
  const pendingRecent = recentLab && projects[recentLab.id] === undefined;
  const resumeLab =
    !isStaff && classId
      ? (resumeRecent ??
        (!pendingRecent &&
          visibleLabs.find((lab) => {
            const progress = progressOf(lab);
            return progress && progress.done > 0 && progress.done < progress.total;
          })))
      : null;
  const resumeProgress = resumeLab ? progressOf(resumeLab) : null;

  useEffect(() => {
    if (!classId || isStaff || catalog === null) return;
    for (const lab of HOME_LABS) {
      const entry = entryOf(lab.id);
      if (lab.stages === null || !cardVisible(lab)) continue;
      const projectClassId =
        (lab.id === recentLabId ? recentClassId : undefined) ??
        entry?.visibleClassIds?.[0] ??
        classId;
      void api
        .get<ProjectSummary>(`/api/classes/${projectClassId}/labs/${lab.id}/project`)
        .then((project) => setProjects((current) => ({ ...current, [lab.id]: project })))
        .catch(() => setProjects((current) => ({ ...current, [lab.id]: null })));
    }
  }, [classId, isStaff, catalog, recentLabId, recentClassId]);

  return (
    <AppPageLayout className="home-page" topbarProps={{ showHomeLink: false }}>
      <main className="page-content">
        <div className="home-header">
          <div className="home-header-main">
            {primaryMembership ? (
              <p className="home-context">{primaryMembership.className}</p>
            ) : null}
            <div className="home-title-row">
              <h1 id="current-title">实验课程</h1>
              {catalog ? (
                <span className="home-count">
                  {visibleLabs.length} 项实验 · {presentCategories.length} 个主题
                </span>
              ) : null}
            </div>
          </div>

          {resumeLab ? (
            <Link
              className="home-resume-card"
              data-category={resumeLab.category}
              {...labLink(resumeLab.id)}
            >
              <div className="home-resume-meta">
                <span className="home-resume-label">
                  {resumeRecent ? "继续上次实验" : "继续未完成实验"}
                </span>
                <strong>{resumeLab.title}</strong>
                {resumeProgress ? (
                  <span>
                    已通过 {resumeProgress.done} / {resumeProgress.total} 关
                  </span>
                ) : null}
              </div>
              <span className="home-resume-cta">
                继续 <Icon name="arrow-right" size={14} />
              </span>
            </Link>
          ) : null}
        </div>

        {catalog && presentCategories.length > 1 ? (
          <div aria-label="按主题筛选" className="home-filter-bar" role="group">
            <button
              aria-pressed={effectiveCategory === "all"}
              className={`home-filter-pill${effectiveCategory === "all" ? " is-active" : ""}`}
              onClick={() => setActiveCategory("all")}
              type="button"
            >
              全部
              <span className="home-filter-count">{visibleLabs.length}</span>
            </button>
            {presentCategories.map((category) => {
              const count = visibleLabs.filter((lab) => lab.category === category).length;
              const active = effectiveCategory === category;
              return (
                <button
                  aria-pressed={active}
                  className={`home-filter-pill${active ? " is-active" : ""}`}
                  data-category={category}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  type="button"
                >
                  <span aria-hidden="true" className="topic-dot" />
                  {LAB_CATEGORY_LABELS[category]}
                  <span className="home-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="home-content-grid">
          <section aria-labelledby="current-title" className="current-lab-section" id="lab-catalog">
            <div className="lab-card-grid lab-catalog-grid">
              {displayedLabs.map((lab) => {
                const project = projects[lab.id];
                const badge = adminBadge(lab.id);
                const stageProgress = progressOf(lab);
                const completed =
                  stageProgress !== null && stageProgress.done >= stageProgress.total;

                return (
                  <article
                    className={`lab-card${classId ? " is-interactive" : ""}`}
                    data-category={lab.category}
                    key={lab.id}
                  >
                    <AtlasPlate labId={lab.id} />
                    <div className="lab-card-topline">
                      <div className="lab-card-meta">
                        <span className="lab-card-index">{String(lab.index).padStart(2, "0")}</span>
                        <span aria-hidden="true" className="topic-dot" />
                        <span className="category-label">{LAB_CATEGORY_LABELS[lab.category]}</span>
                      </div>
                      {badge ? (
                        <span className={`lab-card-badge is-${badge.tone}`}>{badge.label}</span>
                      ) : stageProgress ? (
                        <span
                          className={`lab-card-badge${completed ? " is-done" : stageProgress.done > 0 ? " is-progress" : ""}`}
                        >
                          {completed ? (
                            <>
                              <Icon name="check" size={11} /> 已通关
                            </>
                          ) : (
                            `${stageProgress.done} / ${stageProgress.total} 关`
                          )}
                        </span>
                      ) : null}
                    </div>
                    <h3>{lab.title}</h3>
                    <p className="lab-card-desc">{lab.description}</p>
                    <div className="lab-card-footer">
                      {stageProgress ? (
                        <StageProgress done={stageProgress.done} total={stageProgress.total} />
                      ) : null}
                      {classId ? (
                        <Link className="lab-card-action" {...labLink(lab.id)}>
                          <span>
                            {lab.id === recentLabId || (project && project.currentStage > 1)
                              ? "继续"
                              : "开始实验"}
                          </span>
                          <Icon name="arrow-right" size={14} />
                        </Link>
                      ) : (
                        <p className="lab-card-locked">请先加入班级，再开始实验。</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!catalog ? (
              <p className="home-status" role="status">
                正在载入实验目录…
              </p>
            ) : !visibleLabs.length ? (
              <p className="home-empty">当前没有开放的实验，等管理员开放后再来。</p>
            ) : null}
          </section>
          {classId && !isStaff ? <StudentTasks key={classId} classId={classId} /> : null}
        </div>
      </main>
    </AppPageLayout>
  );
}

export function HomePage() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <AppPageLayout className="home-page" topbarProps={{ showHomeLink: false }}>
        <main className="page-content">
          <p className="home-loading" role="status">
            正在载入…
          </p>
        </main>
      </AppPageLayout>
    );
  }
  return status === "authenticated" ? <ClassroomHome /> : <AnonymousLanding />;
}
