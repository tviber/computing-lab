import type { ReactNode } from "react";

export type IconName =
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "circle"
  | "copy"
  | "lock"
  | "panel-left"
  | "panel-left-close"
  | "panel-left-open"
  | "rotate-ccw"
  | "user"
  | "warning"
  | "x";

const PATHS: Record<IconName, ReactNode> = {
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="M4 12l5 5L20 7" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-left": <path d="M15 18l-6-6 6-6" />,
  "chevron-right": <path d="M9 18l6-6-6-6" />,
  "chevron-up": <path d="M6 15l6-6 6 6" />,
  circle: <circle cx="12" cy="12" r="8" />,
  copy: (
    <>
      <rect height="13" rx="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  lock: (
    <>
      <rect height="10" rx="2" width="16" x="4" y="11" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  "panel-left": (
    <>
      <rect height="16" rx="3" width="18" x="3" y="4" />
      <path d="M9 4v16" />
    </>
  ),
  "panel-left-close": (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M9 3v18m10-12-3 3 3 3" />
    </>
  ),
  "panel-left-open": (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M9 3v18m6-12 3 3-3 3" />
    </>
  ),
  "rotate-ccw": (
    <>
      <path d="M3 11a9 9 0 1 1 2 7" />
      <path d="M3 4v7h7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </>
  ),
  warning: (
    <>
      <path d="M21.7 18 13.4 4.6a1.6 1.6 0 0 0-2.8 0L2.3 18A1.6 1.6 0 0 0 3.7 20.6h16.6A1.6 1.6 0 0 0 21.7 18Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
};

export function Icon({
  name,
  size = 14,
  title,
}: {
  name: IconName;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className="ui-icon"
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
