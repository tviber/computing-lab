import type { ReactNode } from "react";

type HintDisclosureProps = {
  /** The hint body, pre-formatted by the lab (plain text or annotated JSX). */
  children: ReactNode;
};

/** Native disclosure used by every lab to keep hint styling and interaction consistent. */
export function HintDisclosure({ children }: HintDisclosureProps) {
  return (
    <details className="hint-disclosure">
      <summary>提示</summary>
      <div className="hint-disclosure-content">{children}</div>
    </details>
  );
}
