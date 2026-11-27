import { For, Show } from "solid-js";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { StageLink } from "../../../shared/lab/StageRail";
import { Disclosure } from "../../../shared/ui/Disclosure";
import type { DecodingLabViewModel, DecodingStageItem } from "../controller/viewModel.ts";

function StageRow(props: {
  stage: DecodingStageItem;
  optional?: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <li>
      <StageLink
        active={props.stage.active}
        onSelect={() => props.onSelect(props.stage.index)}
        optional={props.optional}
        passed={props.stage.passed}
        subtitle={props.stage.englishTitle}
        title={props.stage.title}
        unlocked={props.stage.unlocked}
      />
    </li>
  );
}

/**
 * The decoding rail: core stages in order, with each `railAfter` challenge
 * anchored in a collapsible 支线练习 group right behind its core stage —
 * the same pattern as the cpu rail.
 */
export function DecodingStageRail(props: {
  model: DecodingLabViewModel["rail"];
  onSelect: (index: number) => void;
}) {
  return (
    <aside aria-label="关卡进度" class="lab-rail">
      <p class="eyebrow">
        {labMetadata.decoding.title}{" "}
        <span class="cpu-rail-count">
          {props.model.corePassed} / {props.model.coreTotal} 主线
        </span>
      </p>
      <ol class="stage-list">
        <For each={props.model.core}>
          {(entry) => (
            <>
              <StageRow onSelect={props.onSelect} stage={entry.stage} />
              <Show when={entry.challenges.length > 0}>
                <li class="stage-branch-item">
                  <Disclosure
                    class="stage-branch"
                    open={entry.challenges.some((s) => s.active)}
                    summary={
                      <>
                        <span>支线练习 · 第 {entry.stage.index} 关后</span>
                        <span>
                          {entry.challenges.filter((s) => s.passed).length} /{" "}
                          {entry.challenges.length}
                        </span>
                      </>
                    }
                    summaryClass="stage-branch-summary"
                  >
                    <ol class="stage-list stage-branch-list">
                      <For each={entry.challenges}>
                        {(challenge) => (
                          <StageRow onSelect={props.onSelect} optional stage={challenge} />
                        )}
                      </For>
                    </ol>
                  </Disclosure>
                </li>
              </Show>
            </>
          )}
        </For>
      </ol>
      <Show when={props.model.challenges.length > 0}>
        <div class="cpu-rail-challenges">
          <p class="cpu-rail-group">选做挑战</p>
          <ol class="stage-list">
            <For each={props.model.challenges}>
              {(stage) => <StageRow onSelect={props.onSelect} stage={stage} />}
            </For>
          </ol>
        </div>
      </Show>
    </aside>
  );
}
