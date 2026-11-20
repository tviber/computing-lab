import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Icon } from "../ui/Icon";
import { useScrollEdges } from "../ui/scrollEdges";

export type LabResetScope = { scope: "stage"; stageIndex: number } | { scope: "lab" };

export type LabResetControlsProps = {
  stageIndex: number;
  canReset: boolean;
  resetting: boolean;
  resetError: string | null;
  onReset: (scope: LabResetScope) => Promise<boolean>;
};

export type LabPageShellProps = {
  labId: string;
  rail: ReactNode;
  collapsedLabel?: ReactNode;
  railWidth?: number;
  contentClassName?: string;
  forceExpand?: boolean;
  resetControls?: LabResetControlsProps;
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

const narrowRailQuery = "(max-width: 960px)";

function subscribeToNarrowRail(onChange: () => void) {
  const media = window.matchMedia?.(narrowRailQuery);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

function isNarrowRail() {
  return window.matchMedia?.(narrowRailQuery).matches ?? false;
}

function LabProgressTools({
  stageIndex,
  canReset,
  resetting,
  resetError,
  onReset,
}: LabResetControlsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [scope, setScope] = useState<LabResetScope["scope"]>("stage");
  const [showError, setShowError] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <div className="lab-progress-tools">
      <button
        aria-haspopup="dialog"
        aria-disabled={resetting || undefined}
        aria-label="重置进度"
        className="lab-rail-action"
        disabled={!canReset}
        onClick={() => {
          if (resetting) return;
          setScope("stage");
          setShowError(false);
          setNotice("");
          dialog.current?.showModal();
        }}
        title="重置进度"
        type="button"
      >
        <Icon name="rotate-ccw" size={16} />
        <span>重置进度</span>
      </button>
      <span className="sr-only" role="status">
        {notice}
      </span>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="lab-reset-dialog"
        onCancel={(event) => {
          if (resetting) event.preventDefault();
        }}
        ref={dialog}
      >
        <h2 id={titleId}>重置实验进度</h2>
        <p id={descriptionId}>此操作只影响你自己的记录，清除后无法恢复。</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canReset || resetting) return;
            setShowError(true);
            if (await onReset(scope === "stage" ? { scope, stageIndex } : { scope })) {
              dialog.current?.close();
              setNotice("实验进度已重置。");
            }
          }}
        >
          <fieldset aria-label="重置范围" className="lab-reset-options" disabled={resetting}>
            <label>
              <input
                checked={scope === "stage"}
                name="reset-scope"
                onChange={() => setScope("stage")}
                type="radio"
              />
              <span>
                <strong>从本关重来</strong>
                <small>清除第 {stageIndex} 关及依赖它的后续关卡记录，保留不受影响的关卡。</small>
              </span>
            </label>
            <label>
              <input
                checked={scope === "lab"}
                name="reset-scope"
                onChange={() => setScope("lab")}
                type="radio"
              />
              <span>
                <strong>重置整个实验</strong>
                <small>清除所有关卡的记录，从第 1 关开始。</small>
              </span>
            </label>
          </fieldset>
          {showError && resetError ? (
            <p className="test-error" role="alert">
              {resetError}
            </p>
          ) : null}
          <div className="lab-reset-actions">
            <button
              className="button button-ghost"
              disabled={resetting}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              取消
            </button>
            <button
              className="button lab-reset-confirm"
              disabled={!canReset || resetting}
              type="submit"
            >
              {resetting ? "重置中…" : "确认重置"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export function LabPageShell({
  labId,
  rail,
  collapsedLabel,
  railWidth = 240,
  contentClassName = "page-content",
  forceExpand = false,
  resetControls,
  children,
}: LabPageShellProps) {
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => readCollapsed(labId));
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const narrow = useSyncExternalStore(subscribeToNarrowRail, isNarrowRail);
  const effective = !forceExpand && (narrow ? mobileCollapsed : desktopCollapsed);
  const scrollId = useId();
  const scrollRef = useScrollEdges<HTMLDivElement>();

  const toggle = () => {
    if (narrow) {
      setMobileCollapsed((prev) => !prev);
      return;
    }
    const next = !desktopCollapsed;
    setDesktopCollapsed(next);
    try {
      localStorage.setItem(storageKey(labId), next ? "1" : "0");
    } catch {
      // storage unavailable — collapse still works for this mount
    }
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
            <Icon name={narrow ? "chevron-down" : "panel-left"} size={18} />
            {narrow ? <span>{collapsedLabel ?? "关卡"}</span> : null}
          </button>
          {!narrow && effective && collapsedLabel ? (
            <span className="lab-rail-bar-label">{collapsedLabel}</span>
          ) : null}
        </div>
        <div className="lab-rail-scroll" hidden={effective} id={scrollId} ref={scrollRef}>
          {rail}
        </div>
        {resetControls ? <LabProgressTools {...resetControls} /> : null}
      </div>
      {children}
    </div>
  );
}
