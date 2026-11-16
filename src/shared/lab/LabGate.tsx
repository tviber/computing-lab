import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AccountRole } from "../auth";
import type { SaveStatus } from "../api/client";
import { AppPageLayout } from "../layout/AppTopbar";
import { Icon } from "../ui/Icon";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
  conflict: "已载入最新进度",
  "sync-error": "同步失败",
};

export function SaveIndicator({
  status,
  onRestoreLocal,
  onDiscardLocal,
  onRetrySync,
  unresolvedSyncConflict,
}: {
  status: SaveStatus;
  /** A recoverable local copy exists for the conflicted stage — the control
   *  swaps the server's copy back for what the learner had typed. Offered
   *  for as long as a backup survives, not only while "conflict" shows. */
  onRestoreLocal?: () => void;
  /** Drops the recoverable local copy — the student accepts the server's
   *  draft as final. */
  onDiscardLocal?: () => void;
  /** The post-conflict refetch failed (sync-error): refetch again — the only
   *  path that lifts the save fence. */
  onRetrySync?: () => void;
  /** A sync-error is still unreconciled for this stage — the retry stays
   *  visible while it is set, even after further edits flipped the save
   *  flag back to "dirty" (the fence is still armed underneath). */
  unresolvedSyncConflict?: boolean;
}) {
  return (
    <span aria-live="polite" className={`save-indicator is-${status}`}>
      {status === "saved" ? <Icon name="check" size={11} /> : null}
      {SAVE_LABEL[status]}
      {(status === "sync-error" || unresolvedSyncConflict === true) && onRetrySync ? (
        <button className="save-indicator-restore" onClick={onRetrySync} type="button">
          重试同步
        </button>
      ) : null}
      {onRestoreLocal ? (
        <button className="save-indicator-restore" onClick={onRestoreLocal} type="button">
          找回我未保存的修改
        </button>
      ) : null}
      {onDiscardLocal ? (
        <button
          aria-label="丢弃找回的本地修改"
          className="save-indicator-discard"
          onClick={onDiscardLocal}
          title="丢弃找回的本地修改"
          type="button"
        >
          <Icon name="x" size={10} />
        </button>
      ) : null}
    </span>
  );
}

/**
 * Every lab page runs the same entry gates before its workspace mounts:
 * auth still loading → sign-in prompt → labs closed to this user turn them
 * away → a class membership is required. Renders `children` once a member
 * (or staff previewer) with a classId reaches the lab.
 */
export function LabAccessGate(props: {
  status: "loading" | "anonymous" | "authenticated";
  role: AccountRole | null;
  classId: string | undefined;
  /** Shown in the closed-lab notice, e.g. 「空间采样」. */
  labName: string;
  /** True while fetching the lab catalog for a non-admin caller. */
  checkingAccess?: boolean;
  /** The lab is not open to this user (hidden or scoped to other classes). */
  closed?: boolean;
  /** Extra guidance under the "你还没有加入班级" heading. */
  noClassHint?: string;
  children: ReactNode;
}) {
  const { status, role, classId, labName, checkingAccess, closed, noClassHint, children } = props;
  if (status === "loading" || checkingAccess) {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 需要登录</p>
          <h1>请先登录</h1>
          <div className="error-actions">
            <Link className="button button-primary" to="/login">
              去登录
            </Link>
          </div>
        </main>
      </AppPageLayout>
    );
  }
  if (closed && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 暂未开放</p>
          <h1>这个实验暂未开放</h1>
          <p>「{labName}」暂未对你所在的班级开放，开放后再来。</p>
        </main>
      </AppPageLayout>
    );
  }
  if (!classId) {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 未加入班级</p>
          <h1>你还没有加入班级</h1>
          {noClassHint ? <p>{noClassHint}</p> : null}
        </main>
      </AppPageLayout>
    );
  }
  return <>{children}</>;
}
