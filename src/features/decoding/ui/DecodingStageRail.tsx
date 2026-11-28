import { For, Show } from "solid-js";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { OptionalChallengeGroup, StageLink } from "../../../shared/lab/StageRail";
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
 * anchored in a collapsible 选做挑战 group right behind its core stage.
 */
export function DecodingStageRail(props: {
  model: DecodingLabViewModel["rail"];
  onSelect: (index: number) => void;
}) {
  return (
    <aside aria-label="关卡进度" class="lab-rail">
      <p class="eyebrow">
        {labMetadata.decoding.title}{" "}
        <span class="lab-rail-count">
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
                  <OptionalChallengeGroup
                    open={entry.challenges.some((s) => s.active)}
                    passedCount={entry.challenges.filter((s) => s.passed).length}
                    totalCount={entry.challenges.length}
                  >
                    <For each={entry.challenges}>
                      {(challenge) => (
                        <StageRow onSelect={props.onSelect} optional stage={challenge} />
                      )}
                    </For>
                  </OptionalChallengeGroup>
                </li>
              </Show>
            </>
          )}
        </For>
      </ol>
    </aside>
  );
}
