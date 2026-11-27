import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/solid/collapsible";
import type { JSX } from "@solidjs/web";

type HintDisclosureProps = {
  /** The hint body, pre-formatted by the lab (plain text or annotated JSX). */
  children?: JSX.Element;
};

/** Collapsible disclosure used by every lab to keep hint styling and interaction consistent. */
export function HintDisclosure(props: HintDisclosureProps) {
  return (
    <Collapsible class="hint-disclosure">
      <CollapsibleTrigger class="disclosure-trigger hint-disclosure-trigger" type="button">
        提示
      </CollapsibleTrigger>
      <CollapsiblePanel class="hint-disclosure-content" keepMounted>
        {props.children}
      </CollapsiblePanel>
    </Collapsible>
  );
}
