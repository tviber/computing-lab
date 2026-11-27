import { useLocation, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { AuthProvider, type AuthState } from "../../shared/auth";
import { AppPageLayout, type AppTopbarProps } from "../../shared/layout/AppTopbar";
import "./lab-preview.css";

const VIEWPORTS = [
  { id: "desktop", label: "桌面 · 1440", width: 1440 },
  { id: "tablet", label: "平板 · 820", width: 820 },
  { id: "mobile", label: "手机 · 393", width: 393 },
] as const;

const previewAuthState: AuthState = { status: "anonymous", session: null };

/**
 * Isolates a dev preview from the app's auth session. Whatever surrounds
 * the preview — a signed-in account, a provider mounted before the route
 * change, a skipped /api/auth/me — the subtree sees a fixed anonymous
 * context that never fires an auth request and can never read or mutate
 * the real session. The app's own AuthProvider is left untouched.
 */
export function PreviewAuthBoundary(props: { children?: JSX.Element }) {
  return <AuthProvider initialState={previewAuthState}>{props.children}</AuthProvider>;
}

export type LabPreviewScene = { id: string; label: string };

export function LabPreviewPage<A, S extends LabPreviewScene>(props: {
  scenes: readonly S[];
  title: string;
  subtitle: string;
  frameTitle: string;
  frameClassName?: string;
  frameTopbar?: (scene: S) => JSX.Element;
  frameTopbarProps?: (scene: S) => Pick<AppTopbarProps, "title" | "subtitle">;
  createActions: (record: (action: string) => void) => A;
  renderWorkspace: (scene: S, actions: A) => JSX.Element;
}) {
  return (
    <PreviewAuthBoundary>
      <LabPreviewContent {...props} />
    </PreviewAuthBoundary>
  );
}

function LabPreviewContent<A, S extends LabPreviewScene>(props: {
  scenes: readonly S[];
  title: string;
  subtitle: string;
  frameTitle: string;
  frameClassName?: string;
  frameTopbar?: (scene: S) => JSX.Element;
  frameTopbarProps?: (scene: S) => Pick<AppTopbarProps, "title" | "subtitle">;
  createActions: (record: (action: string) => void) => A;
  renderWorkspace: (scene: S, actions: A) => JSX.Element;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const scene = createMemo(
    () => props.scenes.find((s) => s.id === searchParams.scenario) ?? props.scenes[0],
  );
  const viewport = createMemo(
    () => VIEWPORTS.find((v) => v.id === searchParams.viewport) ?? VIEWPORTS[0],
  );
  const [lastAction, setLastAction] = createSignal("尚未操作");
  const actions = createMemo(() => props.createActions(setLastAction));
  let frameRef: HTMLIFrameElement | undefined;

  const frameSrc = createMemo(() => {
    const currentScene = scene();
    if (!currentScene) return "";
    const params = new URLSearchParams({ scenario: currentScene.id, frame: "1" });
    return `${location.pathname}?${params.toString()}`;
  });

  createEffect(frameSrc, () => {
    const iframe = frameRef;
    if (!iframe) return;
    let observer: ResizeObserver | undefined;
    const syncHeight = () => {
      const height = iframe.contentDocument?.documentElement?.scrollHeight;
      if (height) iframe.style.height = `${height}px`;
    };
    const attach = () => {
      const doc = iframe.contentDocument;
      if (!doc || doc.URL === "about:blank") return;
      syncHeight();
      observer?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(syncHeight);
        observer.observe(doc.documentElement);
        if (doc.body) observer.observe(doc.body);
      }
    };
    attach();
    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      observer?.disconnect();
    };
  });

  return (
    <Show when={scene()}>
      {(activeScene) => (
        <Show
          fallback={
            <AppPageLayout
              class="lab-preview lab-preview-flow"
              topbarProps={{
                title: props.title,
                subtitle: props.subtitle,
                showAccount: false,
              }}
            >
              <div class="page-content lab-preview-controls">
                <label>
                  固定场景
                  <select
                    onChange={(e) => setSearchParams({ scenario: e.currentTarget.value })}
                    value={activeScene().id}
                  >
                    <For each={props.scenes}>{(s) => <option value={s.id}>{s.label}</option>}</For>
                  </select>
                </label>
                <label>
                  预览视口
                  <select
                    onChange={(e) => setSearchParams({ viewport: e.currentTarget.value })}
                    value={viewport().id}
                  >
                    <For each={VIEWPORTS}>{(v) => <option value={v.id}>{v.label}</option>}</For>
                  </select>
                </label>
                <p>操作只记录事件；切换场景查看其他状态。视口使用 iframe，真实触发媒体查询。</p>
              </div>
              <div class="lab-preview-frame-scroll">
                <iframe
                  ref={(el) => {
                    frameRef = el;
                  }}
                  src={frameSrc()}
                  style={{ width: `${viewport().width}px` }}
                  title={props.frameTitle}
                />
              </div>
            </AppPageLayout>
          }
          when={searchParams.frame === "1"}
        >
          <AppPageLayout
            class={`lab-preview-flow${props.frameClassName ? ` ${props.frameClassName}` : ""}`}
            topbar={props.frameTopbar?.(activeScene())}
            topbarProps={{ ...props.frameTopbarProps?.(activeScene()), showAccount: false }}
          >
            <p class="lab-preview-event" data-scene={activeScene().id} role="status">
              固定场景 · 仅记录操作：{lastAction()}
            </p>
            {props.renderWorkspace(activeScene(), actions())}
          </AppPageLayout>
        </Show>
      )}
    </Show>
  );
}
