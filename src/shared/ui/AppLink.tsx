import { useHref, useInRouter, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, omit } from "solid-js";

export type AppLinkProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

/**
 * Router-aware anchor that resolves app-relative paths against the active
 * router basepath and degrades safely in isolated tests rendered outside a
 * router.
 */
export function AppLink(props: AppLinkProps) {
  const inRouter = useInRouter();
  const resolvedHref = inRouter ? useHref(() => props.href) : () => props.href;
  const rest = omit(props, "href");
  return <a {...rest} href={resolvedHref()} />;
}

export function Redirect(props: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  createEffect(
    () => [props.to, props.replace ?? true] as const,
    ([to, replace]) => {
      navigate(to, { replace });
    },
  );
  return null;
}
