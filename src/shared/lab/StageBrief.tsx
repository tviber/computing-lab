import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { HintDisclosure } from "../ui/HintDisclosure";
import { StageTask } from "./StageTask";

export type StageBriefProps = {
  task: JSX.Element;
  mission?: JSX.Element;
  description?: JSX.Element;
  judgeNote?: JSX.Element;
  hints?: readonly JSX.Element[];
  takeaway?: JSX.Element;
  passed?: boolean;
  /** Lab-specific explanation shown after the description. */
  children?: JSX.Element;
  /** Lab-specific material shown after the hint / takeaway. */
  footer?: JSX.Element;
  taskTitle?: string;
  class?: string;
};

/**
 * Shared stage header: task, brief, judge note, hints while working, and the
 * takeaway after passing. Every lab uses the same order and visibility rules.
 */
export function StageBrief(props: StageBriefProps) {
  return (
    <section class={`stage-brief${props.class ? ` ${props.class}` : ""}`}>
      <StageTask title={props.taskTitle}>{props.task}</StageTask>
      <Show when={props.mission}>{(mission) => <p>{mission()}</p>}</Show>
      <Show when={props.description}>{(description) => <p>{description()}</p>}</Show>
      {props.children}
      <Show when={props.judgeNote}>{(note) => <p class="submit-note">判题方式：{note()}</p>}</Show>
      <Show when={!props.passed && props.hints && props.hints.length > 0}>
        <div class="stage-brief-hints">
          <For each={props.hints}>{(hint) => <HintDisclosure>{hint}</HintDisclosure>}</For>
        </div>
      </Show>
      <Show when={props.passed && props.takeaway}>
        {(takeaway) => <p class="stage-takeaway">本关收获：{takeaway()}</p>}
      </Show>
      {props.footer}
    </section>
  );
}
