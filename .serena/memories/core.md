# Core

- This is the project entry point, not a source dump. For full component ownership and cross-layer data flow, consult `docs/architecture.md`; `AGENTS.md` defines engineering constraints.
- For route/page composition and shared client infrastructure, read `mem:frontend/core`; for API, persistence, and judging, read `mem:backend/core`. For cross-layer work, use both.
- For the CPU lab's guided-stage teaching model (prefill/editable rows, prompt gating shared by client and judge, trace-driven phase UI), read `mem:cpu_lab`.
- For the image labs' shared "low-bandwidth transmission" frame (mission lines, student-code-driven preview toggles, lost-feature collision feedback), read `mem:image_labs`.
- For the decoding lab's artifact-as-submission judging (per-user seeded payloads re-derived server-side, Pyodide ack-after-load contract, BMP profile constraints), read `mem:decoding_lab`.
- For the lunch-shift lab's word-tables + priority-table judging (browser Pyodide → JSON tables, fixed server parsers, order-set difficulty ladder), read `mem:lunch_shift`.
- Read `mem:conventions` when changing shared UI or architecture; `mem:tech_stack` when changing runtime or dependencies.
- Read `mem:suggested_commands` when selecting local commands and `mem:task_completion` when preparing validation or handoff.
- Preserve feature ownership: `src/app` composes routes/pages; lesson semantics stay under `src/features/<lab>`; shared code is infrastructure only.
