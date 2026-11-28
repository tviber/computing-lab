# v2 post-study and handoff

Date: 2026-08-19. Scope: the selected behavior lane (Protocol Process, Audio Encoding, Relational Data) plus the copy-only localization lane.

## What changed after calibration

The calibration packet was rendered-page-only simulation. Its PRE/POST/DELTA values remain calibration signals, not human effect sizes. The independent critic and the re-evaluation gate required a separate copy/accessibility ledger, explicit objective-leakage checks, and a human preflight before any human-learning claim.

| Lab              | PRE → POST signal                                                   | Product response                                                                                                        | Claim status                                                               |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Protocol Process | Knowledge-denied 0.5 → 1.5; lossy 0.5 → 1.5; impatient 0.5 → 1.0    | Chinese-first prediction/controls, neutral scenario labels, event/queue evidence, comparison held until an event exists | Mechanism survives; human-language issue remains simulated until preflight |
| Audio Encoding   | Knowledge-denied 0.5 → 1.0; lossy 1.0 → 1.0; careful 0.0 → 1.5      | Chinese-first source/mode/view labels, explicit aliasing and quantization sentences, bounded accessible evidence        | Mechanism promising; transfer and comprehension claims downgraded          |
| Relational Data  | Knowledge-denied 0.0 → 1.5*; lossy 0.5 → 1.0*; impatient 0.5 → 1.0* | Query result/provenance/constraint evidence withheld until a query frame exists; Chinese labels and caveats             | Prior contaminated; no learning delta claim                                |

`*` Objective leakage made the simulated delta non-causal. Packet-1 prerequisite-dependent items are excluded from learning claims.

## In-app browser blind replay

The replay used fresh route loads, first DOM snapshot before exploration, knowledge-denied instructions, natural controls, and no search/reopen/answer lookup. The lossy budget was five minutes and at most eight meaningful interactions.

- Protocol: first snapshot had no `情境比较` region and no event frame. After recording a prediction and executing one step, the event queue tables and comparison region appeared. The page exposed event-level evidence without an initial scenario verdict.
- Audio: first snapshot exposed controls and bounded 440 Hz reference evidence but no high-frequency aliasing outcome. Selecting `混叠（aliasing）`, then `高频脉冲`, produced per-component rows showing `发生混叠` and folded frequencies.
- Relational: first snapshot had no `关系数据约束` region and no `查询结果行` table. After `执行一步`, both query evidence and constraint evidence appeared.

This is synthetic browser evidence, not a student sample. Narrow-viewport semantics are covered by the selected UI tests, and the full Playwright contract was rerun in both root and base-path configurations.

## Contamination and legibility controls

- LLM-to-LLM legibility bias is reported separately from objective leakage, prior contamination, and browser/automation artifacts.
- Initial answer leakage is checked before interaction; technical identifiers and first-use terms are retained only where they are part of the domain.
- The behavior ledger is limited to the three selected labs. Program, Two’s Complement, Image, Home Network, UTF-8, Monte Carlo, and Byte Edit received copy/accessibility localization only.
- `human-preflight.md` contains the worksheets. No real student or teacher preflight has been run.

## Validation

- `bun run format:check` — pass
- `bun run lint` — pass
- `bun run typecheck` — pass
- `bun run test:run` — pass: 56 files, 336 tests
- `bun run test:deploy` — pass: all deployment scenarios
- `bun run build` — pass; Vite chunk-size warning only
- `bun run test:e2e` — pass: root E2E 26/26
- `VITE_BASE_PATH=/computing-lab/ BASE_PATH=/computing-lab bun run test:e2e` — pass: base-path E2E 26/26
- In-app browser replay — pass for the three selected first-render/interaction checks above

## Surviving and downgraded claims

Surviving: feature-local state/evidence sequencing, Chinese-first accessible controls, bounded evidence regions, and no initial answer table for the selected interaction paths.

Downgraded: human comprehension, transfer, teacher silence, and learning-effect claims. They require the prepared human preflight and must not be inferred from simulated deltas.

## Handoff status

**NOT READY for human deployment evidence.** The productization branch is suitable for review as a draft PR. Human preflight and reviewer decisions remain open before promoting the research claims or changing the PR out of draft.
