import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { HostAccount } from "./host";
import { AppLink } from "../ui/AppLink";
import "./app-layout.css";

export type AppTopbarProps = {
  children?: JSX.Element;
  context?: JSX.Element;
  leading?: JSX.Element;
  nav?: JSX.Element;
  showAccount?: boolean;
  showHomeLink?: boolean;
  subtitle?: JSX.Element;
  title?: string;
};

export function AppTopbar(props: AppTopbarProps) {
  return (
    <header class="app-topbar">
      <div class="app-topbar-left">
        {props.leading}
        <AppLink aria-label="计算实验室首页" class="app-brand-mark" href="/">
          <img alt="" src="/assets/brand-logo.png" />
        </AppLink>
        <div class="app-topbar-heading">
          <Show when={props.title} fallback={<span class="app-brand-name">计算实验室</span>}>
            <h1>{props.title}</h1>
          </Show>
          <Show when={props.subtitle}>
            <p>{props.subtitle}</p>
          </Show>
        </div>
        {props.nav}
      </div>
      <div class="app-topbar-actions">
        <Show when={props.showHomeLink ?? true}>
          <AppLink class="app-home-link" href="/">
            返回首页
          </AppLink>
        </Show>
        {props.context}
        {props.children}
        <Show when={props.showAccount ?? true}>
          <HostAccount />
        </Show>
      </div>
    </header>
  );
}

export function AppPageLayout(props: {
  children?: JSX.Element;
  footer?: JSX.Element;
  class?: string;
  className?: string;
  topbar?: JSX.Element;
  topbarProps?: Omit<AppTopbarProps, "children">;
}) {
  const extraClass = () => props.class ?? props.className;
  return (
    <div class={`page-layout${extraClass() ? ` ${extraClass()}` : ""}`}>
      <AppTopbar {...props.topbarProps}>{props.topbar}</AppTopbar>
      <div class="page-layout-content">{props.children}</div>
      {props.footer}
    </div>
  );
}
