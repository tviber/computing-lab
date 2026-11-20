import { useState, type ReactNode } from "react";

type HintDisclosureProps = {
  /** The hint body, pre-formatted by the lab (plain text or annotated JSX). */
  children: ReactNode;
};

type HintState = "closed" | "confirming" | "revealed";

/**
 * Expand / confirm / hide disclosure for a stage hint — the interaction is
 * lab-agnostic; each lab supplies its own body formatting via `children`.
 */
export function HintDisclosure({ children }: HintDisclosureProps) {
  const [state, setState] = useState<HintState>("closed");

  if (state === "revealed") {
    return (
      <div aria-label="提示" className="hint-disclosure is-revealed" role="region">
        <div className="hint-disclosure-heading">
          <span className="hint-disclosure-label">提示</span>
          <button
            aria-expanded={true}
            className="hint-disclosure-action disclosure-trigger"
            onClick={() => setState("closed")}
            type="button"
          >
            隐藏提示
          </button>
        </div>
        <p>{children}</p>
      </div>
    );
  }

  if (state === "confirming") {
    return (
      <div
        aria-labelledby="hint-confirmation-title"
        className="hint-disclosure hint-disclosure-confirmation"
        role="group"
      >
        <p id="hint-confirmation-title">确定要看提示吗？</p>
        <div className="hint-disclosure-actions">
          <button className="button button-ghost" onClick={() => setState("closed")} type="button">
            暂时不看
          </button>
          <button
            className="button button-primary"
            onClick={() => setState("revealed")}
            type="button"
          >
            确定查看
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hint-disclosure">
      <button
        aria-expanded={false}
        className="hint-disclosure-trigger disclosure-trigger"
        onClick={() => setState("confirming")}
        type="button"
      >
        查看提示
      </button>
    </div>
  );
}
