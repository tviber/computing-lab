/**
 * React wrapper around the vendored Blockly editor. One workspace per
 * station (接单/厨房/出餐); switching tabs disposes and remounts with the
 * station's saved workspace JSON — the same lifecycle the kitchen app used.
 */

import { useEffect, useRef, useState } from "react";
import { FOCUS_LABELS, type BlockDrafts, type Focus } from "../domain/contracts.ts";
import { loadBlockly, mountBlockEditor } from "./blocklyEditor.ts";

export function BlocklyRuleEditor({
  blocks,
  focus,
  disabled,
  onChange,
  onMessage,
}: {
  blocks: BlockDrafts;
  /** Which station's workspace to mount — controlled by the parent tabs. */
  focus: Focus;
  disabled?: boolean;
  onChange: (next: BlockDrafts) => void;
  /** Editor status line (rules applied / incomplete phrases / orphans). */
  onMessage?: (text: string | null) => void;
}) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Latest drafts/callbacks so the mount effect can stay dep-light — a
  // remount per keystroke would destroy the workspace mid-edit.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;
    loadBlockly()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "规则编辑器加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !host || disabled) return;
    const editor = mountBlockEditor(
      host,
      focus,
      {
        workspace: blocksRef.current[focus].workspace,
        rules: blocksRef.current[focus].rules,
      },
      (draft, message) => {
        onChangeRef.current({
          ...blocksRef.current,
          [focus]: { rules: draft.rules, workspace: draft.workspace },
        });
        onMessageRef.current?.(message);
      },
    );
    return () => editor.dispose();
    // Remount only when the station changes or the runtime finishes
    // loading — draft updates flow back through refs.
  }, [ready, focus, disabled]);

  return (
    <div className="lunch-blockly">
      {loadError ? (
        <p className="test-error" role="alert">
          {loadError}
        </p>
      ) : null}
      <div
        aria-label={`${FOCUS_LABELS[focus]}规则编辑区`}
        className="lunch-blockly-host"
        ref={hostRef}
      >
        {!ready && !loadError ? <p className="lunch-note">正在加载规则编辑器…</p> : null}
      </div>
    </div>
  );
}
