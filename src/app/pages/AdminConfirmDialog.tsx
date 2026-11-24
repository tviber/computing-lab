import { useId, useLayoutEffect, useRef, useState } from "react";
import { describeApiError } from "../../shared/api/client";

export function AdminConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="admin-modal"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <p className="eyebrow">确认操作</p>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-modal-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
        <button type="button" className="button button-danger" disabled={busy} onClick={confirm}>
          {busy ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
