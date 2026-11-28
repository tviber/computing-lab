# Research archive policy

> **Archived 2026-11-28 from `main` at `ec8df73`.** These files are historical
> process records, not current architecture or implementation authority.
> Current product decisions live in [docs/architecture.md](../../architecture.md),
> [docs/retired-labs.md](../../retired-labs.md), and
> [docs/deployment.md](../../deployment.md).

This directory keeps durable, decision-level research summaries for Computing Lab. It is not a source dump or an implementation backlog.

## Archived groups

- `learner-studies-v1/` — superseded simulated learner-study observations.
- `learner-studies-v2/` — the historical study methodology and review ledgers.
- `output/` — curriculum inventory, candidate ideation, evaluation, and precedent research.
- `source/` — bibliographic locator only; no textbook text or scans are stored.

Some archived prose keeps its original `research/...` path locators for provenance.
After the move, retained files live under `docs/archive/research/...`; PR20 source
records that were intentionally not retained remain historical references, not live links.

## What is versioned

- `output/00-knowledge-inventory.md` — historical curriculum-coverage baseline.
- `output/01-brainstorm-candidates.md` — converged candidate pool from an earlier ideation stage.
- `output/02-candidate-evaluation.md` — historical multi-perspective candidate evaluation.
- `output/03-precedent-research.md` — external precedent index and source links.
- `output/04-interaction-primitives.md` — historical hypothesis registry only.
- `output/06-primitive-foundation-research.md` — long-term primitive hypothesis foundation research.
- `learner-studies-v1/` — historical direct interaction observations retained from the superseded v1 simulation; not a learning-claim authority.

These are research records, not current architecture authority. Current product and boundary decisions live in `docs/architecture.md`; the ideas from retired labs are summarized in `docs/retired-labs.md`.

## Research authority and implementation boundary

A research report is not an implementation roadmap. `learner-studies-v2/methodology.md` is the current authority for learner-study methodology. Simulated evidence is mainly evidence about interaction, salience, and copy/terminology hypotheses; human learning claims require human evidence. Historical recommendations are not architecture authority. Build feature-local first; consider a shared abstraction only after at least two real compatible consumers and a stable semantic invariant establish that boundary.

## What is intentionally excluded

- Full textbook transcription, scans, OCR, or reconstructed tables. `source/README.md` retains only a bibliographic locator.
- Intermediate role/subagent reports when their result is represented by a retained synthesis.
- Generated OS metadata such as `.DS_Store`.

## Using historical recommendations

A research recommendation is not an approved implementation task. In particular, `04-interaction-primitives.md` is a historical hypothesis registry, while the current repository intentionally keeps only calculator. A future course must be designed feature-local first and may reopen a hypothesis only after a real product need establishes a stable invariant.

## Adding future research

A retained report must state its scope/date, distinguish observed facts from hypotheses, use lawful source locators instead of copied source material, and link any superseding decision. Preserve independent summaries only when they add decision-relevant evidence beyond an existing synthesis.
