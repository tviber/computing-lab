/**
 * Thin dispatcher for AI intake stages: routes stage 2 ("practice") and
 * stage 4 ("final") to their dedicated shells while keeping the public
 * AiIntakePanel export contract stable for LunchShiftLabPage.
 */

import { AiIntakeFinalPanel, type AiIntakeFinalProps } from "./AiIntakeFinalPanel.tsx";
import { AiIntakePracticePanel, type AiIntakePracticeProps } from "./AiIntakePracticePanel.tsx";
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
  if (props.variant === "final") {
    return (
      <AiIntakeFinalPanel
        draft={props.draft}
        onChange={props.onChange}
        onSubmit={props.onSubmit}
        orders={props.orders}
        result={props.result}
        submitting={props.submitting}
      />
    );
  }
  return (
    <AiIntakePracticePanel
      draft={props.draft}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      orders={props.orders}
      result={props.result}
      submitting={props.submitting}
    />
  );
}
