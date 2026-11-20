# Image Labs (image-sampling + color-quantization, issue #74)

## Shared frame

- Both labs tell one low-bandwidth story: the sender compresses/prints each
  member of an atlas; the receiver holds the same atlas and must recognize
  which member arrived. "Closed-set uniqueness" IS decodability — judging
  semantics, hidden galleries, and calibrated thresholds were deliberately
  unchanged.
- Each `StageDef` carries a `mission` line (what is sent + what the receiver
  must recognize) rendered first in `StageBrief`; `description` follows as
  context. UI copy says 发送端原图 / 接收端所见, 信号图谱, 判定方式.
- Stage 1 order is explorer-then-code: `guided` exercises come AFTER the
  explorer in both page components and are framed as "write down the rule
  you just played with" (`GuidedCellTask` / `GuidedTonerTask`).

## Student code drives the preview

- Explorers take `ruleCode` (the stage-1 draft via `draftOf(state, 1).code`)
  and offer a toggle: built-in rule vs 我写的规则.
- Sampling: student `cell_value` runs over every cell region of the shown
  member (one `runCellValue` call, debounced) to build the received grid.
  Gallery recognition and collision probes always use built-in majority,
  including ties. Keep those results explicitly distinguished from the
  displayed member's per-cell student outputs and invalid-value fallbacks.
- Quantization (pick stages only): student `nearest_toner` runs over
  `SOURCE_COLORS` against `[PAPER, ...loadedRgbs]`; result indices map back
  to toner slots (0→-1) to form the effective table feeding
  `quantizeImage`/`judgeMapping`/`confusionPairs`.
- Free stages don't need the toggle: `map_color` already produces
  `draft.table`, which drives the preview directly.
- Invalid returns are collected per cell/color (shown as 0/-1 with an
  inline error line); worker errors fall back to the built-in rule with a
  visible notice. Never let the toggle silently lie about whose rule ran.
- Sampling stage 2 is `requiresChooseSize`: its resolution comes only from a
  successful `choose_size(images)` run. Hide the receiver-rule toggle and all
  manual resolution/probe controls there; editing the code invalidates the old
  resolution, and the server requires a non-empty code snapshot for submission.
- The stage-1 `cell_value` exercise teaches ordinary Python `if/else`; its code
  blanks start empty and must not expose answer placeholders.

## Failure names the lost feature

- Sampling: `diffBounds(a, b)` in `domain/bitmap.ts` returns the
  source-pixel bounding box + differing-pixel count of two same-size
  images; the judge packs it as `counterexample.difference` (from
  `collidedWith[0]`, computed in `encodeVerdictDetail`) and the explorer
  draws it as a `region` outline when a confusion pair is clicked.
- Quantization: `mergedParts(a.parts, b.parts, table)` in
  `domain/sprites.ts` returns the parts whose differing source colors share
  a target toner; packed as `counterexample.merged` (auto-computed inside
  `encodeVerdictDetail`, so the judge call site needs no change). Rendered
  textually via `PART_LABELS` + `SOURCE_COLORS`/`TONER_RACK` names — no
  region overlay exists on `PaletteCanvas`.
- Explorer collision lists are clickable pair buttons: sampling outlines
  the diff region on the original; quant lists the merged parts for the
  pair.

## Scenario link invariants

- Scenario link button only appears for teacher/admin roles (`isStaffRole`),
  because the encoded params (resolution, toners, table) are submission
  content — sharing would let students copy answers.
- When a scenario URL specifies a stage the student has not unlocked,
  `*ScenarioActions` returns `[]` — no params apply. This prevents the
  URL from writing teacher-level drafts into the student's locked stages.
- URL resolution is never applied to `requiresChooseSize` stages (sampling
  stage 2), since those require code-computed output. The page layer already
  skips encoding `shareSearch` for those stages.
