# Lunch-shift Lab (设计餐馆系统 — 4 mainline stages + bonus, 45 分钟)

Layout: `domain/` (contracts, wordTables, priority, scenarios, simulator,
stages, compensate, protocol, runErrors), `lesson/state.ts` (per-stage
drafts + save machinery), `ui/` (panels + `pyodide.worker.ts`/
`pyodideRunner.ts` built on `shared/worker/createWorkerClient` +
`shared/lab/pyodideRuntime`), `server/judge/lunch-shift/{judge,hiddenSet}.ts`.

## Teaching model

- Stages: 1 订单旅程 (guided walkthrough) → 2 修接单 (edit Python word
  tables) → 3 修排队 (write `priority(urgent, wait, cook)`) → 4 正式挑战
  (one-shot hidden set, score = correct + 记对且准时, total 24, edits
  priority only). Stage 5 附加挑战 (compensate) is optional: unlocked by
  passing stage 3, lives as a collapsed "附加挑战（选做）" toggle under
  stage 3 in the rail, autosaves under draft slot 5.
- Server NEVER executes student code. Browser Pyodide worker turns code
  into JSON: stage 2 → `IntakeTables` (dish/note pairs, calm/rush lists,
  insertion order matters, ≤20 entries, keys 1–10 runes); stage 3 → a
  124-cell table of `priority()` over urgent×wait(0–30)×cook(1|3); stage
  5 → a 124-cell table of `compensate()` over urgent×overtime(0–30)×
  delivered. The server re-validates shapes (checkIntakeTables /
  checkPriorityTable / checkCompensateTable, Chinese errors) and replays
  fixed parsers in `domain/`. Code snapshots (≤8000 chars) are kept for
  teacher review only.
- Intake parse semantics: first key hit in insertion order wins per table;
  calm words are checked BEFORE rush; 桌号 is a fixed program (N号桌 /
  桌 N / 桌号 N) with no student trap.
- Queue pick = max table value, ties → FIFO (fifoQueue: arrivalTick then
  id). onTime uses EXPECTED urgency for the deadline (urgent <9, normal
  <18 of 30 ticks) while the priority input uses the PARSED flag.

## Stage 5 scoring (domain/compensate.ts)

- The bill is ONE fixed run everyone pays: the RUSH set replayed
  first-come-first-served (`compensateLateOrders()`), leaving 11 problem
  orders — 5 delivered-late (all urgent, overtime 1–9) + 6 undelivered
  (3 urgent / 3 normal). All three compensate() args matter.
- Grounded model: `REVIEW_RISK` = bad-review percent per (4 tiers:
  mild 1–3 拍 / bad 4–8 / worst 9+ / lost) × (普通/加急) × (0/1/2),
  shown verbatim on the panel as the restaurant's historical data.
  `COMPENSATE_COST` = [0, 2, 15] 元. Expected bad reviews = plain sum
  (badReviewPoints = percent-sum; no RNG, reproducible).
- Pass = BOTH badReviewPoints ≤ 450 (4.5 单) AND spend ≤ 80 元. Ranking
  locked by engine.test: none 860 / snacks 580 fail reviews, refunds
  212@165元 fail spend, urgent-blind refund-all-lost = 328@100元 fails
  spend (90 元 for 6 refunds already busts), urgent-aware middle
  442@61元 passes. `bestCompensation()` is an exact spend-DP under the
  cap (399@74) shown as the gap target.
- Starter code keys off overtime only → 594 points, fails; the fix path
  teaches `delivered` first.

## Order sets (locked by engine.test.ts)

- ② INTAKE_FIXTURES: default tables miss P03(炒饭), P04(不放香菜),
  P08(别太辣), P09(不用赶时间→误急), P11(能快点吗) = 5/12; each fixable
  by one added word, no deadlock.
- ③ QUEUE_FIXTURES (小票已录对): FIFO 8/12, urgent-first 11/12 (Q07
  starves), both scoring styles (additive urgent+1 / overwrite wait≥T→2)
  give 12/12 for every T in 8..16 — a range, not one magic number.
- ④ hiddenSet.ts FINAL_FIXTURES: same trap classes reworded; literal
  practice words lose F02(别放香菜)/F04(麻烦快点)/F07(少放点辣)/F08(麻烦快些)
  = 4/12; generic words (放香菜/快/辣) → 24/24. Same arrival shape as ③
  so the boost formula stays full marks. Test mirrors the fixtures inline.
- RUSH_FIXTURES: optional 20-order 晚高峰 set — stage-3 extra practice
  AND the stage-5 fixed bill source.

## Judging contract

- Stage 2/3/5 malformed submissions → recorded failed submission carrying
  `errors` (retry allowed); stage 4 malformed → `missing-run` 400 BEFORE
  grading (a client-protocol fault, not an attempt). Stage 4 is retryable:
  failed submissions record normally and the student resubmits — pass line
  `FINAL_PASS_SCORE` = 18/24 (stages.ts); the panel never locks (like
  stages 2/3), so a passed student can resubmit for a better score and
  legacy always-pass rows stay fixable without a migration. Stage 4
  summary = ids +
  correct/onTime only — no request text (hidden set stays server-side).
  Stage-4 score = 小票正确数 + 记对且准时数 (a wrong ticket earns no
  delivery point). Stage 5 is pass/fail: score 1/1.
- Any code edit immediately nulls the derived tables/priority in the
  draft — submit stays disabled until a fresh run; newest local preview
  is shown ahead of the last recorded grade.
- trainingOrderFor always returns a normal order (the companion is the
  fixed urgent one) — the step-2 copy assumes exactly one urgent order.
- Draft shapes: IntakeDraft{code,tables}, QueueDraft{code,priority},
  FinalDraft{intakeCode,tables,queueCode,priority} — stage 4 seeds from
  drafts 2+3 in `draftOf`; CompensateDraft{code,compensate}.
  `runSummaries` extras keyed intake/queue/final/compensate.
- DB migration v12 resets lunch-shift (renumbered stages); v13 drops only
  stage-5 submissions/drafts (rescore) plus the removed rush artefacts.

## Pitfalls

- `findFullWidthPunctuation` skips strings AND comments — starter comments
  legitimately contain Chinese punctuation.
- `StageRailItem.englishTitle` is now optional; lunch stages dropped it
  (dashboard falls back to `stage.title`).
- Full-width punctuation check + `friendlyRunError` live in
  `domain/runErrors.ts`; worker timeout covers infinite loops.
- Student-facing copy avoids —— (em dash): use commas/periods instead.
- rush() was removed from stage 4 (it had no real cost; review verdict):
  no rush table, no boost events, RUSH_* names now mean 晚高峰 only.
