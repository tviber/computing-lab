import type { JSX } from "@solidjs/web";
import { For, Match, Show, Switch } from "solid-js";
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
    <button
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
  return (
    <aside aria-label="关卡进度" class="lab-rail">
      <p class="eyebrow">{props.label}</p>
      <ol>
        <For each={props.stages}>
          {(stage) => (
            <li>
              <StageLink
                active={stage.index === props.stageIndex}
                onSelect={() => props.onSelect(stage.index)}
                optional={stage.optional}
                passed={props.passedStages.includes(stage.index)}
                subtitle={stage.englishTitle}
                title={
                  stage.optional ? (
                    <>
                      {stage.title} <small>附加关</small>
                    </>
                  ) : (
                    stage.title
                  )
                }
                unlocked={props.unlocked(stage)}
              />
            </li>
          )}
        </For>
      </ol>
    </aside>
  );
}
