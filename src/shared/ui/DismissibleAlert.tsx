import type { JSX } from "@solidjs/web";
import { Button } from "@ui-sdk/solid/button";
import { Icon } from "./Icon";

/**
 * Error banner with a dismiss button — the `.test-error` chrome shared by
 * lab pages that surface a closable message.
 */
export function DismissibleAlert(props: { children?: JSX.Element; onDismiss: () => void }) {
  return (
    <p class="test-error" role="alert">
      {props.children}
      <Button aria-label="关闭" onClick={() => props.onDismiss()} type="button">
        <Icon name="x" size={12} />
      </Button>
    </p>
  );
}
