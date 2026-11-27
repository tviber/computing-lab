import { Button } from "@ui-sdk/solid/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/solid/dialog";
import { createSignal, Show } from "solid-js";
import { describeApiError } from "../../shared/api/client";

export function AdminConfirmDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await props.onConfirm();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      dismissible={!busy()}
      onOpenChange={(next) => {
        if (!next && !busy()) props.onCancel();
      }}
      open
    >
      <DialogBackdrop class="admin-modal-backdrop" />
      <DialogContent class="admin-modal">
        <p class="eyebrow">确认操作</p>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
        <Show when={error()}>
          {(message) => (
            <p class="auth-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div class="admin-modal-actions">
          <DialogClose class="button button-secondary" disabled={busy()} type="button">
            取消
          </DialogClose>
          <Button
            class="button button-danger"
            disabled={busy()}
            onClick={() => void confirm()}
            type="button"
          >
            {busy() ? props.pendingLabel : props.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
