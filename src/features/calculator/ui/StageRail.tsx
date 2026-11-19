import {
  CALCULATOR_STAGES,
  challengeStages,
  coreStages,
  stagePrerequisites,
} from "../domain/stages";
import { StageLink } from "../../../shared/lab/StageRail";
import { Icon } from "../../../shared/ui/Icon";
import type { ComponentDef } from "../domain/graph";
import { AnnotatedText } from "./CalculatorTerms";

type StageRailProps = {
  stageIndex: number;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  /** Staff free navigation: unlock optional challenges regardless of passed prerequisites. */
  freeNavigation?: boolean;
  onSelectStage: (stageIndex: number) => void;
  onPlaceComponent: (name: string) => void;
  onEditCustomComponent: (name: string) => void;
  onDeleteCustomComponent: (name: string) => void;
  /** Coach spotlight on the “我的组件” shelf. */
  coachHighlight?: boolean;
};

export function StageRail({
  stageIndex,
  passedStages,
  unlockedSubmodules,
  freeNavigation = false,
  onSelectStage,
  onPlaceComponent,
  onEditCustomComponent,
  onDeleteCustomComponent,
  coachHighlight,
}: StageRailProps) {
  const optionalByAnchor = new Map<number, (typeof CALCULATOR_STAGES)[number][]>();
  for (const challenge of challengeStages()) {
    if (challenge.railAfter === undefined) continue;
    const stages = optionalByAnchor.get(challenge.railAfter) ?? [];
    stages.push(challenge);
    optionalByAnchor.set(challenge.railAfter, stages);
  }
  const lateChallenges = challengeStages().filter((stage) => stage.railAfter === undefined);
  const lateChallengesUnlocked =
    freeNavigation ||
    lateChallenges.every((stage) =>
      stagePrerequisites(stage).every((index) => passedStages.includes(index)),
    );
  const lateChallengesPassed = lateChallenges.filter((stage) =>
    passedStages.includes(stage.index),
  ).length;
  const lateChallengeActive = lateChallenges.some((stage) => stage.index === stageIndex);
  const mainlinePassed = coreStages().filter((stage) => passedStages.includes(stage.index)).length;

  const renderStage = (stage: (typeof CALCULATOR_STAGES)[number], optional = false) => {
    const unlocked =
      freeNavigation || stagePrerequisites(stage).every((index) => passedStages.includes(index));
    return (
      <li key={stage.id}>
        <StageLink
          active={stage.index === stageIndex}
          onSelect={() => onSelectStage(stage.index)}
          optional={optional}
          passed={passedStages.includes(stage.index)}
          subtitle={<AnnotatedText text={stage.englishTitle} />}
          title={stage.title}
          unlocked={unlocked}
        />
      </li>
    );
  };

  const renderOptionalBranch = (anchor: number) => {
    const stages = optionalByAnchor.get(anchor) ?? [];
    if (stages.length === 0) return null;
    const passed = stages.filter((stage) => passedStages.includes(stage.index)).length;
    const active = stages.some((stage) => stage.index === stageIndex);
    return (
      <li className="stage-branch-item" key={`branch-${anchor}`}>
        <details className="stage-branch" open={active}>
          <summary className="stage-branch-summary">
            <span>支线练习 · 第 {anchor} 关后</span>
            <span>
              {passed} / {stages.length}
            </span>
          </summary>
          <ol className="stage-list stage-branch-list">
            {stages.map((stage) => renderStage(stage, true))}
          </ol>
        </details>
      </li>
    );
  };

  return (
    <aside className="stage-rail" aria-label="关卡进度">
      <div className="stage-rail-heading">
        <p className="eyebrow">关卡</p>
        <span className="stage-count">
          {mainlinePassed} / {coreStages().length} 主线
        </span>
      </div>

      <div className="stage-group">
        <p className="stage-group-title">课堂主线</p>
        <ol className="stage-list">
          {coreStages().flatMap((stage) => [renderStage(stage), renderOptionalBranch(stage.index)])}
        </ol>
      </div>

      <div className="stage-group">
        <details className="stage-branch stage-branch-late" open={lateChallengeActive}>
          <summary className="stage-group-title stage-branch-summary">
            <span>选做挑战</span>
            <span>
              {lateChallengesPassed} / {lateChallenges.length}
            </span>
          </summary>
          {lateChallengesUnlocked ? null : (
            <p className="stage-group-note">通过全部主线关卡（1–6）后解锁。</p>
          )}
          <ol className="stage-list">{lateChallenges.map((stage) => renderStage(stage))}</ol>
        </details>
      </div>

      <div className={`my-components${coachHighlight ? " coach-focus" : ""}`}>
        <p className="eyebrow">
          我的组件 <span aria-hidden="true">/</span> MY COMPONENTS
        </p>
        {unlockedSubmodules.length === 0 ? (
          <p className="my-components-empty">
            通过关卡解锁，或在画布框选后封装，就能得到可复用组件。
          </p>
        ) : (
          <ul>
            {unlockedSubmodules.map((component) => (
              <li className="component-entry" key={component.name}>
                <button
                  className={`component-chip${component.custom ? " is-custom" : ""}`}
                  onClick={() => onPlaceComponent(component.name)}
                  type="button"
                >
                  <AnnotatedText text={component.name} />
                  {component.custom ? <small>自定义</small> : null}
                </button>
                {component.custom ? (
                  <span className="component-entry-actions">
                    <button
                      aria-label={`编辑自定义组件 ${component.name}`}
                      className="component-edit"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditCustomComponent(component.name);
                      }}
                      title="编辑自定义组件"
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="13"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="13"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      aria-label={`删除自定义组件 ${component.name}`}
                      className="component-delete"
                      onClick={() => {
                        if (window.confirm(`确定删除自定义组件“${component.name}”吗？`)) {
                          onDeleteCustomComponent(component.name);
                        }
                      }}
                      title="删除自定义组件"
                      type="button"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
