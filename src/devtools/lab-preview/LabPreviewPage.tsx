import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
export function PreviewAuthBoundary({ children }: { children: ReactNode }) {
  return <AuthProvider initialState={previewAuthState}>{children}</AuthProvider>;
}

export type LabPreviewScene = { id: string; label: string };

/**
 * DEV-only preview shell for a lab's fixed scenes. The outer page offers a
 * scene picker and a viewport picker and embeds the lab in an iframe at
 * `?frame=1` so media queries trigger honestly. The frame is resized to
 * its content height, so the outer page (and any full-page capture of it)
 * always covers the entire fixture instead of a viewport-sized window.
 * The lab supplies its fixture scenes, an actions factory that records
 * intents instead of hitting the network, and its real workspace renderer.
 */
export function LabPreviewPage<A, S extends LabPreviewScene>(props: {
  /** Fixture scenes, e.g. `{ id, label, model }[]`; the first is the default. */
  scenes: readonly S[];
  /** Outer page heading, e.g. "解码器视觉开发预览". */
  title: string;
  subtitle: string;
  /** iframe accessible title — tests locate the frame through it. */
  frameTitle: string;
  /** Page-layout class for the framed scene, e.g. "decoding-lab". */
  frameClassName?: string;
  /** Extra topbar node for the framed page, e.g. a SaveIndicator. */
  frameTopbar?: (scene: S) => ReactNode;
  /** Topbar title/subtitle derived from the scene. */
  frameTopbarProps?: (scene: S) => Pick<AppTopbarProps, "title" | "subtitle">;
  /** Lab action set, rewired to record intents instead of acting. */
  createActions: (record: (action: string) => void) => A;
  renderWorkspace: (scene: S, actions: A) => ReactNode;
}) {
  return (
    <PreviewAuthBoundary>
      <LabPreviewContent {...props} />
    </PreviewAuthBoundary>
  );
}

function LabPreviewContent<A, S extends LabPreviewScene>({
  scenes,
  title,
  subtitle,
  frameTitle,
  frameClassName,
  frameTopbar,
  frameTopbarProps,
  createActions,
  renderWorkspace,
}: {
  scenes: readonly S[];
  title: string;
  subtitle: string;
  frameTitle: string;
  frameClassName?: string;
  frameTopbar?: (scene: S) => ReactNode;
  frameTopbarProps?: (scene: S) => Pick<AppTopbarProps, "title" | "subtitle">;
  createActions: (record: (action: string) => void) => A;
  renderWorkspace: (scene: S, actions: A) => ReactNode;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const scene = scenes.find((s) => s.id === search.scenario) ?? scenes[0];
  const viewport = VIEWPORTS.find((v) => v.id === search.viewport) ?? VIEWPORTS[0];
  const [lastAction, setLastAction] = useState("尚未操作");
  const actions = createActions(setLastAction);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameSrc = scene
    ? router.buildLocation({
        to: ".",
        search: { scenario: scene.id, frame: "1" },
      }).href
    : "";

  // Resize the frame to its document so the outer page shows (and a
  // full-page capture covers) the entire fixture, not a scrolling window.
  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;
    let observer: ResizeObserver | undefined;
    const syncHeight = () => {
      const height = iframe.contentDocument?.documentElement?.scrollHeight;
      if (height) iframe.style.height = `${height}px`;
    };
    // A fresh frame's contentDocument is about:blank (which fires its own
    // load event and is then replaced); skip it and attach to each real
    // document that loads.
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
  }, [frameSrc]);

  if (!scene) return null;

  if (search.frame === "1") {
    return (
      <AppPageLayout
        className={`lab-preview-flow${frameClassName ? ` ${frameClassName}` : ""}`}
        topbar={frameTopbar?.(scene)}
        topbarProps={{ ...frameTopbarProps?.(scene), showAccount: false }}
      >
        <p className="lab-preview-event" data-scene={scene.id} role="status">
          固定场景 · 仅记录操作：{lastAction}
        </p>
        {renderWorkspace(scene, actions)}
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      className="lab-preview lab-preview-flow"
      topbarProps={{
        title,
        subtitle,
        showAccount: false,
      }}
    >
      <div className="page-content lab-preview-controls">
        <label>
          固定场景
          <select
            value={scene.id}
            onChange={(e) =>
              void navigate({ to: ".", search: { ...search, scenario: e.target.value } })
            }
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          预览视口
          <select
            value={viewport.id}
            onChange={(e) =>
              void navigate({ to: ".", search: { ...search, viewport: e.target.value } })
            }
          >
            {VIEWPORTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <p>操作只记录事件；切换场景查看其他状态。视口使用 iframe，真实触发媒体查询。</p>
      </div>
      <div className="lab-preview-frame-scroll">
        <iframe
          key={frameSrc}
          ref={frameRef}
          title={frameTitle}
          src={frameSrc}
          style={{ width: viewport.width }}
        />
      </div>
    </AppPageLayout>
  );
}
