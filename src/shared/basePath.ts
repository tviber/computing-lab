/**
 * Isomorphic base-path helpers shared by vite.config.ts, the API server, the
 * router, and Playwright — the four places that used to each keep a slightly
 * different copy. Canonical form is "/" or "/segment" — never empty, never a
 * trailing slash.
 */

/**
 * Canonicalize a configured base path. Accepts anything env vars or Vite's
 * BASE_URL might hand over: blanks → "/", missing/extra slashes are folded,
 * and any query/hash suffix is ignored.
 */
export function normalizeBasePath(value: string | undefined): string {
  const raw = (value ?? "").split(/[?#]/)[0].trim() || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

/** Vite's `base` option wants "/" or a path ending in "/". */
export function basePathForVite(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  // A relative base ("./") is legal for Vite and passes through untouched.
  if (trimmed === "./" || trimmed === ".") return "./";
  const base = normalizeBasePath(value);
  return base === "/" ? "/" : `${base}/`;
}

/** URL-join prefix for manual concatenation: "/" → "", "/lab" → "/lab". */
export function basePathPrefix(value: string | undefined): string {
  const base = normalizeBasePath(value);
  return base === "/" ? "" : base;
}

/**
 * Prefer the configured path when the browser is actually under it. A build
 * configured for `/computing-lab` can still be previewed at `/`, where the
 * router must not strip a prefix the location doesn't have.
 */
export function resolveRuntimeBasePath(configuredBasePath: string): string {
  const location = (globalThis as { location?: { pathname: string } }).location;
  if (configuredBasePath === "/" || !location) return configuredBasePath;
  const pathname = location.pathname;
  const isConfiguredPath =
    pathname === configuredBasePath || pathname.startsWith(`${configuredBasePath}/`);
  return isConfiguredPath ? configuredBasePath : "/";
}
