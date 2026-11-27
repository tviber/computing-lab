import { StageBrief as SharedStageBrief } from "../../../shared/lab/StageBrief";
import type { DecodingStageDef } from "../domain/stages.ts";

export function StageBrief(props: { stage: DecodingStageDef; passed: boolean }) {
  return (
    <SharedStageBrief
      description={props.stage.description}
      hints={props.stage.hint ? [props.stage.hint] : []}
      judgeNote={props.stage.judgeNote}
      mission={props.stage.mission}
      passed={props.passed}
      takeaway={props.stage.takeaway}
      task={props.stage.task}
    />
  );
}
