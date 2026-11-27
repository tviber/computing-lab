import { Button } from "@ui-sdk/solid/button";
import { Show } from "solid-js";
import { Icon } from "../ui/Icon";
import type { SaveStatus } from "./contracts";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
  conflict: "已载入最新进度",
  "sync-error": "同步失败",
};

export function SaveIndicator(props: {
  status: SaveStatus;
  /** A recoverable local copy exists for the conflicted stage — the control
   *  swaps the server's copy back for what the learner had typed. Offered
   *  for as long as a backup survives, not only while "conflict" shows. */
  onRestoreLocal?: () => void;
  /** Drops the recoverable local copy — the student accepts the server's
   *  draft as final. */
  onDiscardLocal?: () => void;
  /** The post-conflict refetch failed (sync-error): refetch again — the only
   *  path that lifts the save fence. */
  onRetrySync?: () => void;
  /** A sync-error is still unreconciled for this stage — the retry stays
   *  visible while it is set, even after further edits flipped the save
   *  flag back to "dirty" (the fence is still armed underneath). */
  unresolvedSyncConflict?: boolean;
}) {
  return (
    <span aria-live="polite" class={`save-indicator is-${props.status}`}>
      <Show when={props.status === "saved"}>
        <Icon name="check" size={11} />
      </Show>
      {SAVE_LABEL[props.status]}
      <Show
        when={
          (props.status === "sync-error" || props.unresolvedSyncConflict === true) &&
          props.onRetrySync
        }
      >
        {(onRetry) => (
          <Button class="save-indicator-restore" onClick={() => onRetry()()} type="button">
            重试同步
          </Button>
        )}
      </Show>
      <Show when={props.onRestoreLocal}>
        {(onRestore) => (
          <Button class="save-indicator-restore" onClick={() => onRestore()()} type="button">
            找回我未保存的修改
          </Button>
        )}
      </Show>
      <Show when={props.onDiscardLocal}>
        {(onDiscard) => (
          <Button
            aria-label="丢弃找回的本地修改"
            class="save-indicator-discard"
            onClick={() => onDiscard()()}
            title="丢弃找回的本地修改"
            type="button"
          >
            <Icon name="x" size={10} />
          </Button>
        )}
      </Show>
    </span>
  );
}
