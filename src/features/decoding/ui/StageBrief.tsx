import { Show } from "solid-js";
import { StageTask } from "../../../shared/lab/StageTask";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type { DecodingStageDef } from "../domain/stages.ts";

export function StageBrief(props: { stage: DecodingStageDef; passed: boolean }) {
  return (
    <section class="stage-brief">
      <StageTask>{props.stage.task}</StageTask>
      <p>{props.stage.mission}</p>
      <Show when={props.stage.description}>{(desc) => <p>{desc()}</p>}</Show>
      <p class="submit-note">{props.stage.judgeNote}</p>
      <Show when={props.passed}>
        <p class="stage-takeaway">本关收获：{props.stage.takeaway}</p>
      </Show>
      <Show keyed when={props.stage.hint ? props.stage.id : null}>
        {(_) => <HintDisclosure>{props.stage.hint}</HintDisclosure>}
      </Show>
    </section>
  );
}
