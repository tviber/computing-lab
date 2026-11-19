import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../ui/Icon";

/**
 * The rail|workspace shell every lab page sits inside. Owns the grid columns,
 * the rail's collapse toggle, and per-lab persistence — the rail itself stays
 * a plain ReactNode passed by the page, so stage semantics never enter shared
 * code. Below the shared 960px breakpoint the grid stacks and the toggle is
 * hidden: collapse is a wide-screen affordance only.
 */

export type LabStaffControlsProps = {
  /** Staff (teacher / admin) free stage navigation is enabled across the lab. */
  freeNavigation: boolean;
  /** Disable reset until initial project load finishes. */
  canReset?: boolean;
  resetting?: boolean;
  resetError?: string | null;
  onReset?: () => void;
};

export type LabPageShellProps = {
  /** Lab id — namespaces the localStorage collapse key (`computing-lab:lab-rail:<labId>`). */
  labId: string;
  /** The page's rail element, rendered as-is. */
  rail: ReactNode;
  /** Vertical-strip label shown while collapsed (e.g. 当前关卡). */
  collapsedLabel?: ReactNode;
  /** Expanded rail column width in px; labs keep their historical 220–240. */
  railWidth?: number;
  /** Extra class on the grid root — "page-content" for the standard centered page. */
  contentClassName?: string;
  /** Override that keeps the rail expanded (e.g. a coach highlighting rail content). */
  forceExpand?: boolean;
  /** Shared teacher/admin controls rendered below the stage rail in every interactive lab. */
  staffControls?: LabStaffControlsProps;
  children: ReactNode;
};

function storageKey(labId: string) {
  return `computing-lab:lab-rail:${labId}`;
}

function readCollapsed(labId: string): boolean {
  try {
    return localStorage.getItem(storageKey(labId)) === "1";
  } catch {
    return false;
  }
}

export function LabPageShell({
  labId,
  rail,
  collapsedLabel,
  railWidth = 240,
  contentClassName = "page-content",
  forceExpand = false,
  staffControls,
  children,
}: LabPageShellProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(labId));
  const effective = collapsed && !forceExpand;
  const scrollId = useId();

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey(labId), next ? "1" : "0");
      } catch {
        // storage unavailable — collapse still works for this mount
      }
      return next;
    });
  };

  return (
    <div
      className={`lab-page-grid ${contentClassName}${effective ? " is-collapsed" : ""}${forceExpand ? " is-forced" : ""}`}
      style={{ "--rail-w": `${railWidth}px` } as CSSProperties}
    >
      <div className="lab-rail-zone">
        <div className="lab-rail-bar">
          <button
            aria-controls={scrollId}
            aria-expanded={!effective}
            aria-label={effective ? "展开关卡栏" : "收起关卡栏"}
            className="lab-rail-toggle"
            disabled={forceExpand}
            onClick={toggle}
            title={effective ? "展开关卡栏" : "收起关卡栏"}
            type="button"
          >
            <Icon name={effective ? "chevron-right" : "chevron-left"} size={14} />
          </button>
          {effective && collapsedLabel ? (
            <span className="lab-rail-bar-label">{collapsedLabel}</span>
          ) : null}
        </div>
        <div className="lab-rail-scroll" id={scrollId}>
          {rail}
          {staffControls ? (
            <section aria-label="教师控制" className="lab-staff-tools">
              {staffControls.freeNavigation ? (
                <p className="lab-staff-badge">
                  <Icon name="circle" size={10} />
                  <span>教师视角 · 自由切关</span>
                </p>
              ) : null}
              <p className="lab-staff-note">
                可任意切换并评测全部关卡；重置仅清空你自己的当前实验记录。
              </p>
              {staffControls.onReset ? (
                <button
                  className="button button-ghost lab-staff-reset-btn"
                  disabled={staffControls.canReset === false || staffControls.resetting}
                  onClick={() => {
                    if (
                      window.confirm(
                        "确定重置你在本实验的进度吗？将清空全部草稿、过关与提交记录并回到第 1 关（不影响学生数据）。",
                      )
                    ) {
                      staffControls.onReset?.();
                    }
                  }}
                  type="button"
                >
                  {staffControls.resetting ? "重置中…" : "重置我的进度"}
                </button>
              ) : null}
              {staffControls.resetError ? (
                <p className="test-error" role="alert">
                  {staffControls.resetError}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
