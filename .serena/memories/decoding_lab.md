# Decoding Lab (解码侦探, issue #81)

Layered structure: `controller/` (`useDecodingLabController`,
`useDecodeExecution`, `createViewModel`, `viewModel`), `ui/` (thin
`DecodingLabPage` + `DecodingWorkspace` + panels), `runtime/` (Pyodide
adapter), `preview/` (`/__dev/labs/decoding`, DEV only). `ui/` is under
strict ESLint boundaries (no value imports of
controller/lesson/`domain/stages`; shared hooks banned; page file exempt).

## Teaching model

- Claim: 数据 + 解码约定 = 信息. Every stage ends with a visible decoded
  artifact; the artifact IS the submission (students never submit code to be
  run — server never executes student code; Python runs browser-only in the
  Pyodide worker, code snapshot is saved for teacher review).
- Stages in `domain/stages.ts` (`DECODING_STAGES`, indices 1–6). Mainline
  is 1–3 only (15-20 min 课堂练习口径): codes (字码→词), bits (8 位→句),
  bmp (按约定填空格排像素矩阵). All side stages sit on
  `track:"challenge"` rails anchored `railAfter:3`, `unlockAfter:[3]`:
  4 (files, 三份文件按 meta 选解码器), 5 (bmp-script, R 通道隐写),
  6 (bmp, 修坏解码器——注释标出同事错写的版本，五处空各对一种错法).
  `nextDecodingStage` walks `DECODING_CORE_STAGES` first (主线只数 core),
  then falls to the first unpassed challenge.
- `kind` describes stage rules; `payload.kind` describes data ("bmp-script"
  stage carries a "bmp" payload). Starter code is a `__(n)__` cloze template
  (`domain/cloze.ts`): the UI renders it read-only with an inline text
  input per blank (`ui/ClozeEditor.tsx`, `.cloze-code`/`.cloze-blank`),
  fills live in `DecodingDraft.fills` via the `set-fill` action, and
  `assembleCloze` rebuilds runnable Python; `run` blocks with a Chinese
  message until `clozeComplete`. There is no free-form editor on this page.
  Stages may also ship `starterVariants` — same exercise with different
  blank positions/identifiers; `starterCodeFor(stage, seed)` picks per user
  (`seedFor(userId,"decoding-cloze",idx)`) so copied fills don't transfer.
- Every bmp payload is the same cat GLYPH with a per-user seeded palette
  (`catPixels(pick(rng, CAT_PALETTES))` in domain/sprites.ts) — a
  recognizable target that still makes channel/row-order bugs visible, but
  expected matrices can't be copied across users/stages. The UI shows
  目标图案 beside 解码结果 (`.pixel-compare`) by decoding the payload bytes
  with domain `decodeBmp`; target pixels are never shipped in the payload
  (that IS the answer). Stage-4 files keep random `spritePixels(rng)`.
- BMP stages read the pixel offset FROM the header (`data[__(1)__:]` blank
  answer `data[10]`) — "the file describes how to read it" is exercised,
  not just stated. `decodeBmp` reads offset/width/height from the header.

## Judging

- Per-user payload: `generatePayload(stage, seedFor(userId,"decoding",idx))`
  is deterministic — `GET /project` ships it via `projectExtras.payloads`
  and the judge regenerates the identical one, then `verifyArtifact`
  compares artifact vs reference decode. Failure detail reports only the
  first mismatch position OR a named convention bug when the matrix exactly
  matches a common mistake (行翻转→上下颠倒, R↔B→颜色反了, 转置→行列对调);
  never name the right answer (stage 4 wrong decoder says "与 meta 不符",
  not which decoder).
- Stage prompts are concept checks re-checked server-side: each prompt is a
  `prompt-<id>` part in the verdict list (fail → recorded submission, never
  an opaque 400), and `conceptAnswers` go into the submission snapshot for
  the teacher. UI only records correct picks (`answer-prompt` ignores wrong
  ones and flags `wrongPick`) and still gates the submit button on all
  correct.
- Files-stage can't be passed by decoder choice alone — the artifact must
  match the reference decode; `SlidingWindowLimiter` (12/10min/stage)
  guards guessing.

## Pyodide contract

- `runtime/pyodide.worker.ts` posts `{phase:"executing"}` ONLY after
  `await getPyodide()` resolves — ack before load finishes makes the main
  thread switch the 90s load budget to the 15s exec budget mid-download
  and killWorker wipes the cold start (the #79 regression).
- `runDecode(code, data, {preamble, call})`; preamble hooks: `BMP_HELPER`
  (decode_bmp) for stage 5, `FILE_HELPERS` (decode_as_text/image) for
  stage 4.
- Decoder results may be native JS scalars or PyProxy; call `toJs` and
  `destroy` only when available (string results are used by stages 1, 2, and 5).

## Constraints worth knowing

- BMP profile is deliberately constrained: 54-byte header, 24bpp, BGR,
  bottom-up rows, `width*3%4==0` (encoder throws otherwise) — the X2 buggy
  decoder's three bugs live exactly in offset/通道序/行序. BytePanel marks
  the three 4-byte header fields the stages use (#10–13 起点, #18–21 宽,
  #22–25 高 — the legend names the fields but does NOT inline their values,
  so the cloze answers aren't copyable); a pinned files-stage verdict
  re-syncs to the fresh run output only while the pin still matches the ran
  decoder (`set-verdict.expectDecoder`).
- Stage-4 ambiguity file: asciiSafe palette keeps image bytes printable so
  a text decode also "runs" — meta decides (the lesson, not a bug).
- `?stage=N` deep link applied once after project load (`stageLinkApplied`);
  refresh restores `currentStage` via load-project; an out-of-range pointer
  (all passed) clamps to the last stage.
- Async run results are stage-and-input-bound: each `useDecodeExecution`
  channel (decode run / bmp preview / sample print) stamps every result
  with `{stageIndex, inputRevision}`; drafts bump `inputRevisions[stage]`
  on `set-code`/`set-fill`, so an edit invalidates the stored run and
  gates submit again, and a late completion from another stage can land
  neither a result nor a `running` reset. `set-verdict.stageIndex` still
  drops verdicts that land after a stage switch; submit re-checks
  `clozeComplete`.
