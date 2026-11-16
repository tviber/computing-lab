# Backend Core

- `server/` is the Node API for authentication, drafts, judging, class dashboards, and administration; entrypoint is `server/index.ts`.
- Lab project/draft/judge routes use the shared thin pipeline in `server/routes/labRoutes.ts`; route-specific setup stays in `server/routes/`.
- Draft writes are server-versioned optimistic concurrency: PUT validates `expectedRevision` (400 invalid-revision), `saveStageDraft` compares against `draft_revisions[stage]` inside `withTransaction` and assigns `stored+1` (`applied:false` + stored revision on mismatch). `GET /project` returns `draftRevisions` so clients seed their next expectation. `draft_revisions` stores bare numbers; `toDraftRevisions` still reads legacy `{revision, saveToken}` objects. An omitted `expectedRevision` in `saveStageDraft` is an unconditional write — internal callers only; the route always validates.
- Hidden judging cases and fixtures stay under `server/judge/`; never expose them to browser code.
- Protocol types are shared from each lab's `src/features/<lab>/domain`; keep route orchestration and authoritative judging on the server.
- `server/labs.ts` derives `LAB_REGISTRY` (visibility and stage metadata) from shared `LAB_IDS` / `labMetadata` plus `LAB_SPECS`, and `server/routes/labRegistry.ts` maps every `LabId` to its Hono route factory for `server/index.ts`, so TypeScript enforces registry completeness whenever a lab is added. Use `defaultHidden` on `labMetadata` when a new lab should stay hidden until an admin opens it.
