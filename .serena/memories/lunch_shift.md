# Lunch-shift Lab (设计餐馆系统, rebuilt — four stages, 45 分钟)

Layout: `domain/` (contracts, wordTables, priority, scenarios, simulator,
stages, protocol, runErrors), `lesson/state.ts` (per-stage drafts + save
machinery), `ui/` (panels + `pyodide.worker.ts`/`pyodideRunner.ts` built on
`shared/worker/createWorkerClient` + `shared/lab/pyodideRuntime`),
`server/judge/lunch-shift/{judge,hiddenSet}.ts`.

## Teaching model

- Stages: 1 订单旅程 (guided walkthrough, unchanged) → 2 修接单 (edit
  Python word tables) → 3 修排队 (write `priority(urgent, wait, cook)`) →
  4 正式挑战 (one-shot, hidden set, score = correct + onTime, total 24).
- Server NEVER executes student code. Browser Pyodide worker turns code
  into JSON: stage 2 → `IntakeTables` (dish/note pairs, calm/rush lists,
  insertion order matters, ≤20 entries, keys 1–10 runes); stage 3 → a
  124-cell table of `priority()` over urgent×wait(0–30)×cook(1|3). The
  server re-validates shapes (`checkIntakeTables`/`checkPriorityTable`,
  Chinese error messages) and replays fixed parsers in `domain/`. Code
  snapshots (≤8000 chars) are kept for teacher review only.
- Intake parse semantics: first key hit in insertion order wins per table;
  calm words are checked BEFORE rush; 桌号 is a fixed program (N号桌 /
  桌 N / 桌号 N) with no student trap.
- Queue pick = max table value, ties → FIFO (fifoQueue: arrivalTick then
  id). onTime uses EXPECTED urgency for the deadline (urgent <9, normal
  <18 of 30 ticks) while the priority input uses the PARSED flag.

## Order sets (locked by engine.test.ts)

- ② INTAKE_FIXTURES: default tables miss P03(炒饭), P04(不放香菜),
  P08(别太辣), P09(不用赶时间→误急), P11(能快点吗) = 5/12; each fixable
  by one added word, no deadlock.
- ③ QUEUE_FIXTURES (小票已录对): FIFO 8/12, urgent-first 10/12 (Q06/Q07
  starve), urgent+wait≥T gives 12/12 for every T in 8..16 — a range, not
  one magic number.
- ④ hiddenSet.ts FINAL_FIXTURES: same trap classes reworded; literal
  practice words lose F02(别放香菜)/F04(麻烦快点)/F07(少放点辣) = 3/12;
  generic words (放香菜/快点/辣) → 24/24. Same arrival shape as ③ so the
  boost formula stays full marks. Test mirrors the fixtures inline.
- RUSH_FIXTURES: optional 20-order 晚高峰 local practice, never recorded.

## Judging contract

- Stage 2/3 malformed submissions → recorded failed submission carrying
  `errors` (retry allowed); stage 4 malformed → `missing-run` 400 BEFORE
  grading so it can't burn the one shot; one-shot re-check rides the same
  IMMEDIATE transaction (`final-used` 409). Stage 4 summary = ids +
  correct/onTime only — no request text (hidden set stays server-side).
- Draft shapes: IntakeDraft{code,tables}, QueueDraft{code,priority},
  FinalDraft{intakeCode,tables,queueCode,priority} — stage 4 seeds from
  drafts 2+3 in `draftOf`. `runSummaries` extras keyed intake/queue/final.
- DB migration v12 resets lunch-shift progress/drafts/submissions (stage
  indices renumbered).

## Pitfalls

- `findFullWidthPunctuation` skips strings AND comments — starter comments
  legitimately contain Chinese punctuation.
- `StageRailItem.englishTitle` is now optional; lunch stages dropped it
  (dashboard falls back to `stage.title`).
- Full-width punctuation check + `friendlyRunError` live in
  `domain/runErrors.ts`; worker timeout covers infinite loops.
