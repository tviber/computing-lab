import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import { StageLink } from "../../../shared/lab/StageRail";
import { Icon } from "../../../shared/ui/Icon";
import type { ComponentDef } from "../domain/graph";
import {
  CALCULATOR_STAGES,
  challengeStages,
  coreStages,
  stagePrerequisites,
} from "../domain/stages";
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
};

type CalculatorStage = (typeof CALCULATOR_STAGES)[number];

const OPTIONAL_BY_ANCHOR = (() => {
  const map = new Map<number, CalculatorStage[]>();
  for (const challenge of challengeStages()) {
    if (challenge.railAfter === undefined) continue;
    const stages = map.get(challenge.railAfter) ?? [];
    stages.push(challenge);
    map.set(challenge.railAfter, stages);
  }
  return map;
})();

const LATE_CHALLENGES = challengeStages().filter((stage) => stage.railAfter === undefined);

function StageItem(props: {
  stage: CalculatorStage;
  optional?: boolean;
  stageIndex: number;
  passedStages: number[];
  freeNavigation: boolean;
  onSelectStage: (stageIndex: number) => void;
}) {
  const unlocked = createMemo(
    () =>
      props.freeNavigation ||
      stagePrerequisites(props.stage).every((index) => props.passedStages.includes(index)),
  );
  return (
    <li>
      <StageLink
        active={props.stage.index === props.stageIndex}
        onSelect={() => props.onSelectStage(props.stage.index)}
        optional={props.optional}
        passed={props.passedStages.includes(props.stage.index)}
        subtitle={<AnnotatedText text={props.stage.englishTitle} />}
        title={props.stage.title}
        unlocked={unlocked()}
      />
    </li>
  );
}

function OptionalBranch(props: {
  anchor: number;
  stageIndex: number;
  passedStages: number[];
  freeNavigation: boolean;
  onSelectStage: (stageIndex: number) => void;
}) {
  const stages = OPTIONAL_BY_ANCHOR.get(props.anchor) ?? [];
  const passed = createMemo(
    () => stages.filter((stage) => props.passedStages.includes(stage.index)).length,
  );
  const active = createMemo(() => stages.some((stage) => stage.index === props.stageIndex));

  return (
    <Show when={stages.length > 0}>
      <li class="stage-branch-item">
        <details class="stage-branch" open={active()}>
          <summary class="stage-branch-summary">
            <span>支线练习 · 第 {props.anchor} 关后</span>
            <span>
              {passed()} / {stages.length}
            </span>
          </summary>
          <ol class="stage-list stage-branch-list">
            <For each={stages}>
              {(stage) => (
                <StageItem
                  freeNavigation={props.freeNavigation}
                  onSelectStage={props.onSelectStage}
                  optional
                  passedStages={props.passedStages}
                  stage={stage}
                  stageIndex={props.stageIndex}
                />
              )}
            </For>
          </ol>
        </details>
      </li>
    </Show>
  );
}

export function StageRail(props: StageRailProps) {
  const freeNavigation = () => props.freeNavigation ?? false;
  const lateChallengesUnlocked = createMemo(
    () =>
      freeNavigation() ||
      LATE_CHALLENGES.every((stage) =>
        stagePrerequisites(stage).every((index) => props.passedStages.includes(index)),
      ),
  );
  const lateChallengesPassed = createMemo(
    () => LATE_CHALLENGES.filter((stage) => props.passedStages.includes(stage.index)).length,
  );
  const lateChallengeActive = createMemo(() =>
    LATE_CHALLENGES.some((stage) => stage.index === props.stageIndex),
  );
  const mainlinePassed = createMemo(
    () => coreStages().filter((stage) => props.passedStages.includes(stage.index)).length,
  );

  return (
    <aside aria-label="关卡进度" class="stage-rail">
      <div class="stage-rail-heading">
        <p class="eyebrow">关卡</p>
        <span class="stage-count">
          {mainlinePassed()} / {coreStages().length} 主线
        </span>
      </div>

      <div class="stage-group">
        <p class="stage-group-title">课堂主线</p>
        <ol class="stage-list">
          <For each={coreStages()}>
            {(stage) => (
              <>
                <StageItem
                  freeNavigation={freeNavigation()}
                  onSelectStage={props.onSelectStage}
                  passedStages={props.passedStages}
                  stage={stage}
                  stageIndex={props.stageIndex}
                />
                <OptionalBranch
                  anchor={stage.index}
                  freeNavigation={freeNavigation()}
                  onSelectStage={props.onSelectStage}
                  passedStages={props.passedStages}
                  stageIndex={props.stageIndex}
                />
              </>
            )}
          </For>
        </ol>
      </div>

      <div class="stage-group">
        <details class="stage-branch stage-branch-late" open={lateChallengeActive()}>
          <summary class="stage-group-title stage-branch-summary">
            <span>选做挑战</span>
            <span>
              {lateChallengesPassed()} / {LATE_CHALLENGES.length}
            </span>
          </summary>
          <Show when={!lateChallengesUnlocked()}>
            <p class="stage-group-note">通过全部主线关卡（1–6）后解锁。</p>
          </Show>
          <ol class="stage-list">
            <For each={LATE_CHALLENGES}>
              {(stage) => (
                <StageItem
                  freeNavigation={freeNavigation()}
                  onSelectStage={props.onSelectStage}
                  passedStages={props.passedStages}
                  stage={stage}
                  stageIndex={props.stageIndex}
                />
              )}
            </For>
          </ol>
        </details>
      </div>

      <div class="my-components">
        <p class="eyebrow">
          我的组件 <span aria-hidden="true">/</span> MY COMPONENTS
        </p>
        <Show
          fallback={
            <p class="my-components-empty">
              通过关卡解锁，或在画布框选后封装，就能得到可复用组件。
            </p>
          }
          when={props.unlockedSubmodules.length > 0}
        >
          <ul>
            <For each={props.unlockedSubmodules}>
              {(component) => (
                <li class="component-entry">
                  <Button
                    class={`component-chip${component.custom ? " is-custom" : ""}`}
                    onClick={() => props.onPlaceComponent(component.name)}
                    type="button"
                  >
                    <AnnotatedText text={component.name} />
                    <Show when={component.custom}>
                      <small>自定义</small>
                    </Show>
                  </Button>
                  <Show when={component.custom}>
                    <span class="component-entry-actions">
                      <Button
                        aria-label={`编辑自定义组件 ${component.name}`}
                        class="component-edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onEditCustomComponent(component.name);
                        }}
                        title="编辑自定义组件"
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          fill="none"
                          height="13"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          viewBox="0 0 24 24"
                          width="13"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </Button>
                      <Button
                        aria-label={`删除自定义组件 ${component.name}`}
                        class="component-delete"
                        onClick={() => {
                          if (window.confirm(`确定删除自定义组件“${component.name}”吗？`)) {
                            props.onDeleteCustomComponent(component.name);
                          }
                        }}
                        title="删除自定义组件"
                        type="button"
                      >
                        <Icon name="x" size={12} />
                      </Button>
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </aside>
  );
}
