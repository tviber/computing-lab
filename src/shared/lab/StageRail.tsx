import type { JSX } from "@solidjs/web";
import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Disclosure } from "../ui/Disclosure";
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
  optional?: boolean;
};

/** One stage row: titles on the left, pass/unlock mark on the right. */
export function StageLink(props: {
  title: JSX.Element;
  subtitle?: JSX.Element;
  active: boolean;
  passed: boolean;
  unlocked: boolean;
  /** Optional side stages render dashed and indented. */
  optional?: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      aria-current={props.active ? "step" : undefined}
      class={`lab-stage-link${props.optional ? " is-optional" : ""}${props.active ? " is-active" : ""}${props.passed ? " is-passed" : ""}`}
      disabled={!props.unlocked}
      onClick={() => props.onSelect()}
      type="button"
    >
      <span class="lab-stage-titles">
        <strong>{props.title}</strong>
        <Show when={props.subtitle}>
          <span>{props.subtitle}</span>
        </Show>
      </span>
      <span aria-hidden="true" class="lab-stage-mark">
        <Switch fallback={<Icon name="lock" size={12} />}>
          <Match when={props.passed}>
            <Icon name="check" size={13} />
          </Match>
          <Match when={props.unlocked}>
            <Icon name="circle" size={11} />
          </Match>
        </Switch>
      </span>
    </Button>
  );
}

/**
 * Shared collapsible group for optional challenge stages across labs.
 * Every group renders the same 「选做挑战」 summary.
 */
export function OptionalChallengeGroup(props: {
  passedCount: number;
  totalCount: number;
  open: boolean;
  note?: JSX.Element;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <Disclosure
      chevronSize={12}
      class={
        props.class
          ? `stage-branch optional-challenge-group ${props.class}`
          : "stage-branch optional-challenge-group"
      }
      open={props.open}
      summary={
        <>
          <span>选做挑战</span>
          <span>
            {props.passedCount} / {props.totalCount}
          </span>
        </>
      }
      summaryClass="stage-branch-summary"
    >
      <Show when={props.note}>{props.note}</Show>
      <ol class="stage-list stage-branch-list">{props.children}</ol>
    </Disclosure>
  );
}

/**
 * The plain linear stage rail shared by the data labs — a labeled aside
 * listing every core stage, with any optional challenges grouped under a
 * shared collapsible 「选做挑战」 disclosure. Labs with anchored branches or
 * shelves compose `StageLink` and `OptionalChallengeGroup` directly instead.
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
  const coreStages = createMemo(() => props.stages.filter((stage) => !stage.optional));
  const optionalStages = createMemo(() => props.stages.filter((stage) => stage.optional));
  const optionalPassed = createMemo(
    () => optionalStages().filter((stage) => props.passedStages.includes(stage.index)).length,
  );
  const optionalActive = createMemo(() =>
    optionalStages().some((stage) => stage.index === props.stageIndex),
  );

  return (
    <aside aria-label="关卡进度" class="lab-rail">
      <p class="eyebrow">{props.label}</p>
      <ol>
        <For each={coreStages()}>
          {(stage) => (
            <li>
              <StageLink
                active={stage.index === props.stageIndex}
                onSelect={() => props.onSelect(stage.index)}
                passed={props.passedStages.includes(stage.index)}
                subtitle={stage.englishTitle}
                title={stage.title}
                unlocked={props.unlocked(stage)}
              />
            </li>
          )}
        </For>
        <Show when={optionalStages().length > 0}>
          <li class="stage-branch-item">
            <OptionalChallengeGroup
              open={optionalActive()}
              passedCount={optionalPassed()}
              totalCount={optionalStages().length}
            >
              <For each={optionalStages()}>
                {(stage) => (
                  <li>
                    <StageLink
                      active={stage.index === props.stageIndex}
                      onSelect={() => props.onSelect(stage.index)}
                      optional
                      passed={props.passedStages.includes(stage.index)}
                      subtitle={stage.englishTitle}
                      title={stage.title}
                      unlocked={props.unlocked(stage)}
                    />
                  </li>
                )}
              </For>
            </OptionalChallengeGroup>
          </li>
        </Show>
      </ol>
    </aside>
  );
}
