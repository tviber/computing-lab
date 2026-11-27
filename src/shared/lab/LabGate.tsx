import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";
import type { AccountRole } from "../auth";
import { AppPageLayout } from "../layout/AppTopbar";
import { AppLink } from "../ui/AppLink";

export { SaveIndicator } from "./SaveIndicator";

/**
 * Every lab page runs the same entry gates before its workspace mounts:
 * auth still loading → sign-in prompt → labs closed to this user turn them
 * away → a class membership is required. Renders `children` once a member
 * (or staff previewer) with a classId reaches the lab.
 */
export function LabAccessGate(props: {
  status: "loading" | "anonymous" | "authenticated";
  role: AccountRole | null;
  classId: string | undefined;
  /** Shown in the closed-lab notice, e.g. 「空间采样」. */
  labName: string;
  /** True while fetching the lab catalog for a non-admin caller. */
  checkingAccess?: boolean;
  /** The lab is not open to this user (hidden or scoped to other classes). */
  closed?: boolean;
  /** Extra guidance under the "你还没有加入班级" heading. */
  noClassHint?: string;
  children?: JSX.Element;
}) {
  return (
    <Switch fallback={<>{props.children}</>}>
      <Match when={props.status === "loading" || props.checkingAccess}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={props.status === "anonymous"}>
        <AppPageLayout>
          <main class="not-found" role="status">
            <p class="eyebrow">实验 / 需要登录</p>
            <h1>请先登录</h1>
            <div class="error-actions">
              <AppLink class="button button-primary" href="/login">
                去登录
              </AppLink>
            </div>
          </main>
        </AppPageLayout>
      </Match>
      <Match when={props.closed && props.role !== "admin"}>
        <AppPageLayout>
          <main class="not-found" role="status">
            <p class="eyebrow">实验 / 暂未开放</p>
            <h1>这个实验暂未开放</h1>
            <p>「{props.labName}」暂未对你所在的班级开放，开放后再来。</p>
          </main>
        </AppPageLayout>
      </Match>
      <Match when={!props.classId}>
        <AppPageLayout>
          <main class="not-found" role="status">
            <p class="eyebrow">实验 / 未加入班级</p>
            <h1>你还没有加入班级</h1>
            <Show when={props.noClassHint}>
              <p>{props.noClassHint}</p>
            </Show>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
