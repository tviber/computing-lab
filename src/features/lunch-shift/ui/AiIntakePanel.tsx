/**
 * Thin dispatcher for AI intake stages: routes stage 2 ("practice") and
 * stage 4 ("final") to their dedicated shells while keeping the public
 * AiIntakePanel export contract stable for LunchShiftLabPage.
 */

import { AiIntakeFinalPanel, type AiIntakeFinalProps } from "./AiIntakeFinalPanel.tsx";
import { AiIntakePracticePanel, type AiIntakePracticeProps } from "./AiIntakePracticePanel.tsx";
import { Show } from "solid-js";
export { NEED_CONFIRM_STARTER } from "./useAiIntakeModel.tsx";

export type AiIntakePanelProps =
  | ({
      /** "practice" = stage 2 (public orders, intake only); "final" = stage 4. */
      variant: "practice";
    } & AiIntakePracticeProps)
  | ({
      variant: "final";
    } & AiIntakeFinalProps);

export function AiIntakePanel(props: AiIntakePanelProps) {
  const finalProps = (): AiIntakeFinalProps | undefined =>
    props.variant === "final" ? props : undefined;
  const practiceProps = (): AiIntakePracticeProps | undefined =>
    props.variant === "practice" ? props : undefined;

  return (
    <>
      <Show keyed when={finalProps()}>
        {(panel) => (
          <AiIntakeFinalPanel
            draft={panel.draft}
            onChange={panel.onChange}
            onSubmit={panel.onSubmit}
            orders={panel.orders}
            result={panel.result}
            submitting={panel.submitting}
          />
        )}
      </Show>
      <Show keyed when={practiceProps()}>
        {(panel) => (
          <AiIntakePracticePanel
            draft={panel.draft}
            onChange={panel.onChange}
            onSubmit={panel.onSubmit}
            orders={panel.orders}
            result={panel.result}
            submitting={panel.submitting}
          />
        )}
      </Show>
    </>
  );
}
