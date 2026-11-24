import { StageTask } from "../../../shared/lab/StageTask";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type { DecodingStageDef } from "../domain/stages.ts";

export function StageBrief({ stage, passed }: { stage: DecodingStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <StageTask>{stage.task}</StageTask>
      <p>{stage.mission}</p>
      {stage.description ? <p>{stage.description}</p> : null}
      <p className="submit-note">{stage.judgeNote}</p>
      {passed ? <p className="stage-takeaway">本关收获：{stage.takeaway}</p> : null}
      {stage.hint ? <HintDisclosure key={stage.id}>{stage.hint}</HintDisclosure> : null}
    </section>
  );
}
