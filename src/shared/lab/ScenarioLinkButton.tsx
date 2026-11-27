/**
 * ScenarioLinkButton: copy-to-clipboard link generator for reproducible lab scenarios.
 *
 * Only rendered for staff (teacher/admin) because scenario params encode submission content.
 * Creates a link by dropping ALL current query params (lab routes only read scenario keys)
 * and building a clean URL from origin + pathname + the provided search record.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";

export function ScenarioLinkButton(props: { search: Record<string, string | number> }) {
  const [copied, setCopied] = createSignal(false);
  const [copyFallback, setCopyFallback] = createSignal(false);
  let copyTimeout: number | null = null;
  let fallbackInput: HTMLInputElement | undefined;

  const link = createMemo(() => {
    const url = new URL(window.location.origin + window.location.pathname);
    for (const [key, value] of Object.entries(props.search)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  });

  const copyScenarioLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(link());
      setCopied(true);
      setCopyFallback(false);
      if (copyTimeout !== null) clearTimeout(copyTimeout);
      copyTimeout = window.setTimeout(() => {
        setCopied(false);
        copyTimeout = null;
      }, 1500);
    } catch {
      setCopyFallback(true);
      setCopied(false);
    }
  };

  createEffect(
    () => copyFallback(),
    (shown) => {
      if (shown && fallbackInput) {
        fallbackInput.focus();
        fallbackInput.select();
      }
    },
  );

  onCleanup(() => {
    if (copyTimeout !== null) clearTimeout(copyTimeout);
  });

  return (
    <div class="scenario-link">
      <Button class="button button-ghost" onClick={() => void copyScenarioLink()} type="button">
        {copied() ? "已复制" : "复制实验链接"}
      </Button>
      <span class="scenario-link-hint">同班同学打开后会载入这一关和这组参数（该关需已解锁）</span>
      <Show when={copyFallback()}>
        <div class="scenario-link-fallback">
          <p>复制下面的链接</p>
          <input
            aria-label="实验链接"
            readonly
            ref={(el) => {
              fallbackInput = el;
            }}
            type="text"
            value={link()}
          />
        </div>
      </Show>
    </div>
  );
}
