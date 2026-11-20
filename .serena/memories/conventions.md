# Conventions

- Inline disclosures inherit the shared chevron from `details > summary`; custom HTML buttons opt in with `.disclosure-trigger` and `aria-expanded`. Do not add a second marker in feature CSS.

- Follow `AGENTS.md`; it is the source of truth for ownership, layout, and engineering constraints.
- Keep domain calculations, fixtures, and lesson semantics inside `src/features/<lab>/domain`; lab composition belongs in `ui` and lesson content in `lesson`.
- `src/app` owns routing/page composition. Shared modules contain only infrastructure with live consumers.
- Full-page views use `AppPageLayout` and `AppTopbar`; the topbar supplies the home link except on the home route. Align content to shared page gutters/max-width tokens.
- Keep collection cards consistent across breakpoints; avoid global dark-purple focus outlines.
- Keep teaching formulas and observable state explicit; validate/clamp user-controlled values at domain boundaries.
- ESLint `no-restricted-imports` pattern groups use gitignore syntax, not minimatch extglobs (`!(...)` does not express an exception). Exact pure-module exceptions use `regex`; `src/app/lint-constraints.test.ts` checks both allowed contracts and rejected shortcuts. Architecture tests follow runtime re-exports transitively.
- Node type stripping retains runtime edges for inline `import { type T }` / `export { type T }`; only whole `import type` / `export type` declarations are erased. AST boundary scans include `ImportTypeNode` contracts (including `typeof import`) only in the full dependency pass.
- Status banners (`.test-error`, `.stage-takeaway`), the stage-brief body size (`.stage-brief p` at 13px), and stage-rail primitives (`.stage-list`, `.stage-branch*`, `.lab-stage-link.is-optional`) are defined once in `src/design/base.css` or `src/shared/layout/app-layout.css`. Feature CSS must not redefine cross-page component classes (a feature rule may still layer spacing/color on top).
- `DESIGN.md` frontmatter (`colors:`/`rounded:`/`spacing:`) is the palette allowlist for `npx impeccable detect src/` (deterministic, no LLM; element-level rules need `detect http://localhost:5173`). Keep it in sync with `src/design/tokens.css`: a new color = token + DESIGN.md entry, including domain colors (`--paper`). Radii are four tiers: mini 4 / control 8 / panel 12 / pill 999 (pill only for chips/badges).
- Status ramp roles: `-soft` pale banner bg, `-fill` saturated badge bg, `-ink` AA text on soft bg; dark code/error panels use `--code-*` / `--error-surface`/`--error-ink`. Feature CSS must not re-declare palette vars (decoding's parallel `--color-*` layer was removed) — reference shared tokens directly.
- No `border-left: 3px solid` accent stripes (the `side-tab` AI tell): callouts use full `1px` border + soft bg (accent-line/danger-border).
