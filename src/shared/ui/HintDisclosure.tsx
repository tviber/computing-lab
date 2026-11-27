import type { JSX } from "@solidjs/web";
import { Disclosure } from "./Disclosure";

type HintDisclosureProps = {
  /** The hint body, pre-formatted by the lab (plain text or annotated JSX). */
  children?: JSX.Element;
};

/** Collapsible disclosure used by every lab to keep hint styling and interaction consistent. */
export function HintDisclosure(props: HintDisclosureProps) {
  return (
    <Disclosure
      class="hint-disclosure"
      panelClass="hint-disclosure-content"
      summary="提示"
      summaryClass="hint-disclosure-trigger"
    >
      {props.children}
    </Disclosure>
  );
}
