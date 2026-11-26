# Computing Lab Engineering Guide

## Runtime

- Use Bun `1.2.17` and `bun install --frozen-lockfile`.
- Keep repository as one Vite package. Do not add workspace packages.
- Run `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test:run`, and `bun run build` before handoff.
- Avoid spawning too many Node processes in parallel on this machine: test runners are capped at 2 workers (`maxWorkers: 2` in `vitest.config.ts`, `workers: 2` in `playwright.config.ts`); keep it that way and do not run several heavy scripts at once.
- `local/` holds gitignored local-only material. For deployment, start with
  `docs/deployment.md` and `deploy/` and check `local/deploy/` if provisioned.
- The AI-intake model ships with the repo: `public/vendor/models/` holds
  the pinned BGE weights (verified by `bun run sync:embed`, sha256-locked;
  `--force` re-downloads) and the ONNX runtime pair is bundled via `?url`
  imports — a clean `git archive` deploy needs no extra fetch.

## Boundaries

- `src/app` owns routing and page composition.
- `src/features/<lab>/domain` owns lesson calculations and fixtures.
- `src/features/<lab>/ui` owns lab-specific composition.
- `src/shared/{auth,api,layout,lab}` owns only infrastructure with a live consumer; lesson
  semantics do not belong in shared code.
- Do not import from `talk-polish-ai`; this repository stays independently deployable.

## Frontend layout and visual consistency

- Use `AppPageLayout` and `AppTopbar` from `src/shared/layout` for full-page screens, including access-denied and error states. Keep shared navigation and account behavior in this layout instead of recreating it in page components.
- `AppTopbar` provides “返回首页” by default. Hide it only on the home route with `showHomeLink: false`; do not add duplicate home links in individual page topbars or content actions.
- Keep page gutters and alignment based on shared `.page-content` and `--page-gutter` / `--page-max` tokens. Avoid outer page padding or margins that offset one page from the shared header and other pages. Page-specific content widths are fine when intentional.
- Keep cards in the same collection visually consistent in width and height across breakpoints. Use the grid for equal tracks; avoid one-off spans unless hierarchy explicitly requires them.
- Do not add thick, dark-purple focus outlines globally. Text inputs and textareas may use the existing thin, light-purple focus border.
- Use the shared `.field-select` wrapper for labeled selects so every menu keeps the same custom chevron, `--border-strong` outline, radius, typography, and thin focus border. Do not leave raw selects with the browser’s default bevel or bright focus ring.
- Keep compact expression builders and similar utility controls bounded rather than letting a short value stretch across an entire panel. Use a stable label-above-control rhythm, align controls to the start of their grid cell, and reserve full-width fields for forms that need them.
- Use a restrained control size: normally 36–38px for compact lab tools, 42px for form fields, and at least 44px on coarse pointers. Keep labels secondary and values primary, with spacing and radii from the shared tokens.

## Teaching model

Prefer explicit formulas and observable state. A scenario may be encoded in the URL so a teacher can share a reproducible experiment. Validate and clamp user-controlled values at the domain boundary.

## Verification

- During implementation, use the narrowest relevant tests and changed-file lint/format checks. Run typecheck when types or contracts change, or when the feature is complete.
- Keep the full test suite, build, and Playwright out of the edit/repair loop. Fix issues with focused feedback first; do not repeat a passing expensive check unless relevant code changed afterward.
- After focused checks pass, run `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test:run`, and `bun run build`. On the development Mac, check resource pressure before each heavy command, run them serially with `nice -n 10`, use one worker for Vitest and Playwright, and stop on crashes or sustained hangs.
- For changes to browser routes, authentication, API/persistence boundaries, or complete user flows, run one relevant Playwright spec after build. Reserve the full `bun run test:e2e` suite for CI, release validation, or an explicit request.
