# ML Intro Lab (`ml-intro`)

- **5 linear stages** (`src/features/ml-intro/domain/stages.ts`): `1. tokenize` -> `2. score` -> `3. train` -> `4. evaluate` -> `5. generalize`.
- **Corpus split invariant**: 2,000 stratified SMS (~14.1% spam) are split cleanly between browser and server:
  - Browser & judge (`src/features/ml-intro/domain/corpusData.ts`): `TRAIN_ROWS` (1,400) + `VAL_ROWS` (300). Train vocabulary (7,652 words) is built strictly from `TRAIN_ROWS` to prevent OOV leakage.
  - Server-only held-out test (`server/judge/ml-intro/hiddenCorpus.ts`): `HIDDEN_TEST_ROWS` (300). Never import into `src/` or return raw hidden SMS texts in judge responses.
- **Engine**: Pure-TS forward-maximum-matching tokenizer (`tokenizer.ts`) + Float64Array SGD/BGD solver (`logreg.ts`). No Pyodide dependency.
- **Prompt & stage gating**: Client panels and `server/judge/ml-intro/judge.ts` share `ML_STAGES[i].prompts` and `STAGE*_PUZZLE_*` / threshold constants in `stages.ts`. Stage 5 grades `valLoss <= 0.14` plus held-out `testAccuracy >= 94.5%`, `testPrecision >= 85.0%`, `testRecall >= 75.0%`.
