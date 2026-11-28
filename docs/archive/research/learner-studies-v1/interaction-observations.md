# v1 interaction observations — historical archive

> **SUPERSEDED FOR LEARNING CLAIMS**

**Evidence class:** C — direct observations selected by the independent reviewer from PR20.
**Method label:** simulated rendered-browser observations; unvalidated with human learners.
**Provenance:** the four source records are the PR20 lab reports at `research/learner-studies/labs/{home-network,utf8,monte-carlo,byte-edit}.md`; this archive retains only their direct interaction and rendered-state observations.

The entries below describe what was interacted with or visibly rendered. The later v2 review downgraded the v1 inference layer; this archive keeps only the historical observation layer.

## Home Network

**Source/provenance:** PR20 `research/learner-studies/labs/home-network.md`; four independent simulated persona passes on the rendered `/labs/home-network` route. **Status:** simulated and unvalidated.

- The recorded path began with the editable endpoint cards and a printer probe. The wrong-printer and wrong-gateway presets were also opened.
- After the printer address was changed to `192.168.1.20`, the browser showed a direct local-delivery path. An Internet probe rendered gateway, router, NAT, WAN, and return events.
- Clearing the laptop gateway left the local printer path rendered while the Internet path stopped.
- The observed terminology friction was around prefix, gateway, router, next hop, egress, and NAT labels.

## UTF-8

**Source/provenance:** PR20 `research/learner-studies/labs/utf8.md`; fresh-browser simulated-persona fallback after subagent-thread exhaustion on the rendered `/labs/utf8` route. **Status:** simulated and unvalidated, with lower independence than the other selected records.

- The recorded path selected the mixed `Aé猫🙂` fixture and stepped through its code-point frames.
- The rendered trace showed one-, two-, three-, and four-byte rows for `U+0041`, `U+00E9`, `U+732B`, and `U+1F642`; the selected-frame view exposed the scalar, branch, template, and byte evidence.
- The recorded controls and evidence surfaces included fixture selection, Step/Run, frame selection, byte grouping, and the before/after output.
- The observed terminology friction was the distinction between code point and byte, plus the scalar-range, lead-byte, continuation-byte, and template labels.

## Monte Carlo

**Source/provenance:** PR20 `research/learner-studies/labs/monte-carlo.md`; four independent simulated persona passes on the rendered `/labs/monte-carlo` route. **Status:** simulated and unvalidated.

- The recorded path stepped batches, ran small and large cases, changed seeds, and opened the batch trace and comparison surfaces.
- The browser rendered changing inside/total counts, estimate, error, and per-batch records as the controls changed.
- Step/Run were the first prominent controls in the recorded paths; seed, sample-size/fixture choices, batch, and frame labels were then used or inspected.
- The observed terminology friction was around seed, fixture, batch, frame, accuracy, and precision.

## Byte Edit

**Source/provenance:** PR20 `research/learner-studies/labs/byte-edit.md`; four independent simulated persona passes on the rendered `/labs/byte-edit` route. **Status:** simulated and unvalidated.

- The recorded path opened the Original, CJK, emoji, and corrupt-continuation presets, then edited a byte such as `A9` to `AA` or `41`.
- The browser exposed the byte string, one-byte edit control, before/after decode, grouped bytes, and validity evidence after the edit.
- The observed terminology friction included the distinction between an offending byte and a conceptual cause, the meaning of `Original`, and the UI index base versus one-based position wording.
- The selected controls visibly changed the decoded output and validity state; the preset and reset/history surfaces were also recorded as separate interaction points.
