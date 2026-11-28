# v2 calibration findings

Date: 2026-08-19. Method: rendered-page-only simulated passes; lower independence than a human sample. PRE was answered before opening each page. POST/transfer was answered from retained evidence without reopening the page. The independent critic is recorded in `human-language-critic.md`.

## Summary table

Scores are average item points on a 0–2 scale. They are calibration signals, not human effect sizes.

| Lab / role                    | PRE | POST | DELTA | Main observation                                                                                     |
| ----------------------------- | --: | ---: | ----: | ---------------------------------------------------------------------------------------------------- |
| Protocol / knowledge-denied   | 0.5 |  1.5 |  +1.0 | Causal evidence works; labels still require unsupported vocabulary.                                  |
| Protocol / lossy              | 0.5 |  1.5 |  +1.0 | Runs to result; accepted vs ACK-observed remains blurred.                                            |
| Protocol / careful            | 0.5 |  2.0 |  +1.5 | Can cite drop/accept/retry; simulated ticks remain abstract.                                         |
| Protocol / impatient          | 0.5 |  1.0 |  +0.5 | Runs to the final verdict; skips prediction and most explanatory prose.                              |
| Audio / knowledge-denied      | 0.5 |  1.0 |  +0.5 | Can see alias rows; cannot justify “folded” from page alone.                                         |
| Audio / lossy                 | 1.0 |  1.0 |   0.0 | Play path is easy; analysis meaning is skipped.                                                      |
| Audio / careful               | 0.0 |  1.5 |  +1.5 | Rate/alias evidence noticed, but bit-depth meaning needs a concrete sentence.                        |
| Audio / impatient             | 1.0 |  1.0 |   0.0 | Play is obvious; analysis vocabulary and evidence are skipped.                                       |
| Image / knowledge-denied      | 0.5 |  1.5 | +1.0* | Can notice fewer samples and fewer palette states; the causal distinction is not yet Chinese-first.  |
| Image / lossy                 | 0.5 |  1.5 |  +1.0 | Quantization view gives a concrete banding explanation; raw payload and sampling evidence are dense. |
| Image / impatient             | 0.5 |  1.0 |  +0.5 | Finds the visual error map but skips most parameter and payload explanations.                        |
| Relational / knowledge-denied | 0.0 |  1.5 | +1.5* | Page directly states the NULL/FK answer before exploration.                                          |
| Relational / lossy            | 0.5 |  1.0 | +0.5* | Runs all queries; `provenance` and join rule are not naturally understood.                           |
| Relational / careful          | 0.0 |  1.5 | +1.5* | Can follow source rows after Step; abstract labels remain unnecessary.                               |
| Relational / impatient        | 0.5 |  1.0 | +0.5* | Runs all queries; sees counts but does not naturally inspect source-row reasoning.                   |
| Program / knowledge-denied    | 1.0 |  1.5 | +0.5* | Trace is clear; Chinese intro leaks final-false rule.                                                |
| Program / lossy               | 1.0 |  1.5 |  +0.5 | Run gives output; English fixture/frame labels are low-value friction.                               |
| Program / careful             | 1.0 |  2.0 |  +1.0 | State changes and final false check are visible after stepping.                                      |
| Program / impatient           | 1.0 |  1.0 |   0.0 | Runs to output 6; does not inspect the causal trace.                                                 |
| Two’s / knowledge-denied      | 0.5 |  1.5 | +1.0* | Page exposes target answer; English terminology blocks independent explanation.                      |
| Two’s / lossy                 | 1.0 |  1.5 | +0.5* | Example button and evidence are strong; dense table needs translation.                               |
| Two’s / careful               | 0.0 |  1.5 |  +1.5 | Carry-out and signed overflow can be separated after reading the table.                              |

`*` = objective leakage makes DELTA non-causal and should not be reported as learning. Packet 1 prerequisite-dependent items are also excluded from DELTA.

## Lab-by-lab judgment

### Protocol Process

**High-confidence simulated human-language issue; medium mechanism evidence.** Three roles noticed the same distinction: receiver acceptance, ACK generation, sender observation, and timeout knowledge are different. The page exposes the right events, but its English labels and abstract ticks make a Chinese low-prior learner reconstruct too much. Previous “strong alignment” survives only for the causal representation, not for self-sufficient language. Real-human confirmation is still required.

### Audio Encoding

**High-confidence simulated human-language issue.** The rate/bit-depth split is not established in Chinese at the moment of use. “Folded frequency” shows a result but not why it is the result. The knowledge-denied learner can report “above Nyquist” and “folds to” but cannot justify the concept from the page. Previous strong transfer claim is downgraded to “mechanism promising, language uncalibrated.” Real-human confirmation is still required.

### Relational Data

**High-confidence simulated objective leakage + language issue.** The page explains NULL, empty string, and the broken FK before any query is run. Correct transfer cannot be attributed to the interaction. “Provenance” and “derived cells” are developer-facing labels; source-row evidence itself is useful and should stay. Real-human confirmation is still required.

### Image Encoding

**Medium-confidence copy issue; mechanism promising.** Visual differences make sampling loss and quantization loss observable, and the page has useful pixel/payload evidence. The current labels and parameter descriptions still make a Chinese low-prior learner translate too much before they can connect fewer positions to spatial loss or fewer palette states to banding. Keep this lab in the copy-only lane for this phase; do not claim a behavior effect without human preflight.

### Program Execution

**Medium-confidence copy issue; core mechanism survives.** The trace is unusually legible after Step. The introduction and fixture descriptions leak the loop-stop idea, and English labels add friction, but no domain rewrite is indicated. Treat as copy/localization, not a behavior redesign unless human pre-flight disagrees.

### Two’s Complement

**Medium-confidence copy issue; mechanism promising.** Fixed-width, signed/unsigned, carry-out, and overflow evidence are all visible. Target examples leak the answer. “Primary reading” and dense English ripple headings are unsuitable for low-prior Chinese learners. Keep behavior local and translate/clarify evidence.

## Evidence categories

| Category                         | Findings                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Interaction discoverability      | Step/Run and main visual evidence are found; optional prediction is often skipped. Guided inspection is less obvious.                   |
| Human-language comprehensibility | Strongest blockers in Protocol, Audio, Relational; persistent English in all shell/lab chrome.                                          |
| Prior contamination              | Especially high for Audio, Protocol, SQL/relational, and Two’s; knowledge-denied rules reduce but cannot eliminate model contamination. |
| Mechanism learning               | Strongest in Program and Protocol traces; Audio and Relational require clearer causal sentences.                                        |
| Transfer delta                   | Positive-looking, but Relational/Program/Two’s are contaminated by answer leakage; treat as provisional.                                |
| Teacher dependence               | Unknown from simulation. Do not retain previous teacher-silence scores as validated evidence.                                           |

## Confidence wording

All repeated language findings below mean **HIGH CONFIDENCE SIMULATED HUMAN-LANGUAGE ISSUE**, not confirmed human failure. Objective leakage is a separate product fact. Browser interaction observations that depend on range/drag behavior remain **LIKELY LLM/AUTOMATION ARTIFACT** until reproduced by a human or deterministic test.

## Selection gate result

Behavioral productization: **Protocol Process, Audio Encoding, Relational Data**.
Copy-only localization: Program, Two’s, Image, Home Network, UTF-8, Monte Carlo, Byte Edit, plus shell/home/error surfaces.
No domain-model rewrite. No new lab. No shared lesson runtime.
