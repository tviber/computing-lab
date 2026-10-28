import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";

/**
 * The stage shape every lab rail renders — a 1-based index, an id, and the
 * two titles. Locking rules stay with the lab: the caller decides `unlocked`
 * per stage while passed/active state comes from the shared progress schema.
 */
export type StageRailItem = {
  index: number;
  id: string;
  title: string;
  /** Optional second line — omitted entirely when absent. */
  englishTitle?: string;
};

/** One stage row: titles on the left, pass/unlock mark on the right. */
export function StageLink(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  active: boolean;
  passed: boolean;
  unlocked: boolean;
  /** Optional side stages render dashed and indented. */
  optional?: boolean;
  onSelect: () => void;
}) {
  const { title, subtitle, active, passed, unlocked, optional, onSelect } = props;
  return (
    <button
      aria-current={active ? "step" : undefined}
      className={`lab-stage-link${optional ? " is-optional" : ""}${active ? " is-active" : ""}${passed ? " is-passed" : ""}`}
      disabled={!unlocked}
      onClick={onSelect}
      type="button"
    >
      <span className="lab-stage-titles">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      <span aria-hidden="true" className="lab-stage-mark">
        {passed ? (
          <Icon name="check" size={13} />
        ) : unlocked ? (
          <Icon name="circle" size={11} />
        ) : (
          <Icon name="lock" size={12} />
        )}
      </span>
    </button>
  );
}

/**
 * The plain linear stage rail shared by the data labs — a labeled aside
 * listing every stage. Labs with richer rails (groups, branches, shelves)
 * compose `StageLink` directly instead.
 */
export function StageRail(props: {
  /** Eyebrow label over the list, e.g. 「空间采样」. */
  label: string;
  stages: StageRailItem[];
  unlocked: (stage: StageRailItem) => boolean;
  passedStages: readonly number[];
  stageIndex: number;
  onSelect: (index: number) => void;
}) {
  const { label, stages, unlocked, passedStages, stageIndex, onSelect } = props;
  return (
    <aside aria-label="关卡进度" className="lab-rail">
      <p className="eyebrow">{label}</p>
      <ol>
        {stages.map((stage) => (
          <li key={stage.id}>
            <StageLink
              active={stage.index === stageIndex}
              onSelect={() => onSelect(stage.index)}
              passed={passedStages.includes(stage.index)}
              subtitle={stage.englishTitle}
              title={stage.title}
              unlocked={unlocked(stage)}
            />
          </li>
        ))}
      </ol>
    </aside>
  );
}
