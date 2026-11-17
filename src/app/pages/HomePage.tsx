import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import {
  LAB_IDS,
  LAB_CATEGORY_LABELS,
  labMetadata,
  type LabId,
  type LabMetadataEntry,
} from "../../shared/lab/labMetadata";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import { APP_LABS, type AppLabEntry } from "../labRegistry";
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

const HOME_LABS = LAB_IDS.map((id) => {
  const meta: LabMetadataEntry = labMetadata[id];
  const appLab: AppLabEntry = APP_LABS[id];
  return {
    id,
    ...meta,
    stages: appLab.homeProgressStages,
    primary: appLab.primaryCard,
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

  useEffect(() => {
    void api
      .get<{ assignments: StudentTask[] }>(`/api/classes/${classId}/task-assignments`)
      .then((p) => setTasks(p.assignments))
      .catch(() => setTasks([]));
  }, [classId]);

  if (!tasks || tasks.length === 0) return null;
  const pending = tasks.filter((task) => task.status !== "reviewed").length;
  return (
    <section aria-labelledby="tasks-title" className="home-tasks-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">班级作业</p>
          <h2 id="tasks-title">任务单</h2>
        </div>
        <span className="home-count">{pending} 待完成</span>
      </div>
      <div className="home-task-list">
        {tasks.map((task) => (
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
              aria-label={`${task.status === "reviewed" ? "查看批改" : task.status === "submitted" ? "查看提交" : task.status === "in_progress" ? "继续作答" : task.status === "returned" ? "重新作答" : "开始作答"}：${task.title}`}
              className="home-task-action"
              params={{ assignmentId: task.id, classId }}
              to="/classes/$classId/tasks/$assignmentId"
            >
              {task.status === "reviewed"
                ? "查看批改"
                : task.status === "submitted"
                  ? "查看提交"
                  : task.status === "in_progress"
                    ? "继续作答"
                    : task.status === "returned"
                      ? "重新作答"
                      : "开始作答"}
              <Icon name="arrow-right" size={14} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function AnonymousLanding() {
  return (
    <AppPageLayout className="home-page" topbarProps={{ showAccount: false, showHomeLink: false }}>
      <main className="page-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">校内信息技术实验</p>
            <h1 id="home-title">计算实验室</h1>
            <p className="home-lede">
              用逻辑门亲手搭出一个能做加减乘的计算器。每一关都由服务器判定，通过后解锁下一关。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary" to="/login">
                登录 <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </AppPageLayout>
  );
}

function StageProgress({ currentStage, total }: { currentStage: number; total: number }) {
  const done = Math.max(0, Math.min(currentStage - 1, total));
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
      <p className="progress-caption">
        已通过 {done} / {total} 关
      </p>
    </div>
  );
}

function ClassroomHome() {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [projects, setProjects] = useState<Record<string, ProjectSummary | null>>({});
  const classId = primaryMembership?.classId;
  const isStaff = isStaffRole(role);
  const isAdmin = role === "admin";
  // Labs closed to this user (hidden, or scoped to other classes) drop off
  // non-admin surfaces; admins still see the cards (badged) so they can
  // preview and adjust visibility.
  const entryOf = (labId: LabId) => catalog?.get(labId);
  const cardVisible = (lab: (typeof HOME_LABS)[number]) => {
    if (isAdmin) return true;
    const entry = entryOf(lab.id);
    if (lab.defaultHidden) return entry?.visible === true;
    return entry?.visible !== false;
  };
  const adminBadge = (labId: LabId) => {
    if (!isAdmin) return "";
    const entry = entryOf(labId);
    if (entry?.hidden) return " · 已隐藏";
    if (entry?.openClassIds) return ` · ${entry.openClassIds.length} 个班可见`;
    return "";
  };
  const hasVisibleLab = HOME_LABS.some((lab) => cardVisible(lab));

  useEffect(() => {
    if (!classId || isStaff || catalog === null) return;
    for (const lab of HOME_LABS) {
      const entry = entryOf(lab.id);
      if (lab.stages === null || entry?.visible === false) continue;
      const projectClassId = entry?.visibleClassIds?.[0] ?? classId;
      void api
        .get<ProjectSummary>(`/api/classes/${projectClassId}/labs/${lab.id}/project`)
        .then((project) => setProjects((current) => ({ ...current, [lab.id]: project })))
        .catch(() => setProjects((current) => ({ ...current, [lab.id]: null })));
    }
  }, [classId, isStaff, catalog]);

  return (
    <AppPageLayout className="home-page" topbarProps={{ showHomeLink: false }}>
      <main className="page-content">
        <div className="home-content-grid">
          <section className="current-lab-section" aria-labelledby="current-title" id="lab-catalog">
            <div className="section-heading">
              <div>
                <p className="eyebrow">动手探索</p>
                <h1 id="current-title">实验课程</h1>
              </div>
              <span className="home-count">{HOME_LABS.filter(cardVisible).length} 项实验</span>
            </div>

            <div className="lab-card-grid lab-catalog-grid">
              {HOME_LABS.map((lab, index) => {
                const project = projects[lab.id];
                return cardVisible(lab) ? (
                  <article className={`lab-card${lab.primary ? " is-primary" : ""}`} key={lab.id}>
                    <div className="lab-card-topline">
                      <span className="lab-card-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="category-label">{LAB_CATEGORY_LABELS[lab.category]}</span>
                    </div>
                    <h3>{lab.title}</h3>
                    <p>{lab.description}</p>
                    {isAdmin && adminBadge(lab.id) ? (
                      <span className="home-admin-note">{adminBadge(lab.id).trim()}</span>
                    ) : null}
                    {!isStaff && project && lab.stages !== null ? (
                      <StageProgress currentStage={project.currentStage} total={lab.stages} />
                    ) : null}
                    {classId ? (
                      <Link className="lab-card-action" to={`/labs/${lab.id}` as `/labs/${LabId}`}>
                        {project && project.currentStage > 1 ? "继续" : "开始实验"}
                        <Icon name="arrow-right" size={14} />
                      </Link>
                    ) : (
                      <p>请先加入班级，再开始实验。</p>
                    )}
                  </article>
                ) : null;
              })}
            </div>
            {!hasVisibleLab ? (
              <p className="home-empty">当前没有开放的实验，等管理员开放后再来。</p>
            ) : null}
          </section>

          {classId && !isStaff ? <StudentTasks classId={classId} /> : null}
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
