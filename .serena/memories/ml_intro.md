# ML Intro Lab (`ml-intro`)

- **6 linear stages** (`src/features/ml-intro/domain/stages.ts`): `1. strategy` -> `2. tokenize` -> `3. score` -> `4. train` -> `5. evaluate` -> `6. generalize`.
  - Stage 1 (`strategy.ts`): 10-word toy strategy (`[-5, 5]` slider/numeric weights, 6 10-word SMS examples) using piecewise baseline probability `strategyScoreToProbability` (`15%` at `w·x = 0`, deliberately NOT Logistic Regression) and requiring both positive (`>=2`) and negative (`>=2`) weights.
- **Corpus split & classroom scrubbing**: 2,000 classroom-curated, PII-redacted (`TEL`/`URL`/`ID`/`NUM`) SMS rows (~14.1% spam) stored as `<label>\t<text>`:
  - Browser & judge (`src/features/ml-intro/domain/corpusData.ts`): `TRAIN_ROWS` (1,400) + `VAL_ROWS` (300). Train vocabulary is built strictly from `TRAIN_ROWS` to prevent OOV leakage.
  - Server-only held-out test (`server/judge/ml-intro/hiddenCorpus.ts`): `HIDDEN_TEST_ROWS` (300). Never import into `src/` or return raw hidden texts or detailed hidden-test metrics in judge responses.
- **Unified engine**:
  - `tokenizeWords` (`src/features/ml-intro/domain/tokenizer.ts`) performs forward-maximum-matching solely against the fixed static `CN_LEXICON` (`cnLexicon.ts`, MIT general lexicon, independent of `trainVocab`). Both corpus ingestion (`corpus.ts`, `hiddenSet.ts`) and UI inspection (`inspectCorpusMessageWithModel` / `inspectMessageWithModel`) share this single boundary so model predictions and explanations match bit-for-bit (`0/300` drift).
  - `trainLogisticRegression` (`logreg.ts`) uses seeded per-epoch Fisher-Yates SGD shuffling (`DEFAULT_TRAIN_SEED = 2026`, `shuffleEpochs: true` default) alongside invariant optional `bgdHistory`.
- **Prompt & stage gating**: Client panels and `server/judge/ml-intro/judge.ts` share `ML_STAGES[i].prompts` and semantic threshold constants in `stages.ts`. Stage 6 evaluates public validation loss (`<= 0.14`) + held-out accuracy/precision/recall gates server-side, returning only public validation metrics plus a single sealed `hidden-blind-exam` pass/fail part to prevent test-set hill-climbing.
