import { Button } from "@ui-sdk/solid/button";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import type { RunSummary } from "../domain/contracts.ts";
import { SimMap } from "./SimMap.tsx";
import { useQueueReplay } from "./useQueueReplay";

export function QueueReplay(props: { run: RunSummary; autoPlay?: boolean }) {
  const replay = useQueueReplay(
    () => props.run,
    () => props.autoPlay,
  );

  return (
    <div class="lunch-replay">
      <SimMap run={replay.viewRun()} tick={replay.current()?.tick ?? 0} />
      <p aria-live="polite" class="lunch-replay-caption">
        {replay.caption()}
      </p>
      <div class="lunch-replay-controls">
        <Button class="button button-secondary" onClick={replay.togglePlay} type="button">
          {replay.playing() ? "暂停回放" : replay.atEnd() ? "重播回放" : "播放回放"}
        </Button>
        <LabeledSlider
          class="lunch-replay-range"
          label="进度"
          max={Math.max(replay.frames().length - 1, 0)}
          min={0}
          onChange={(next) => replay.onSeek(String(next))}
          step={1}
          value={replay.step()}
          valueText={`第 ${replay.step() + 1} 帧`}
        />
        <strong>
          {replay.frames().length
            ? `第 ${replay.current()!.tick} 拍 · 共 ${replay.frames().length} 帧`
            : "没有事件"}
        </strong>
      </div>
    </div>
  );
}
