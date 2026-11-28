# Learner studies v2 — calibration protocol

Date: 2026-08-19
Purpose: calibrate human-legibility and learning claims before a bounded productization pass.
Scope: five deep-calibration rendered labs: Image Encoding, Audio Encoding, Protocol Process, Relational Data, and Program Execution. Two's Complement receives a supplemental terminology pass. This cohort is frozen before implementation.

## Threats registered before exploration

1. **LLM-to-LLM legibility bias.** A language model may reconstruct omitted causal steps, decode compressed labels, and recognize English technical vocabulary that a Chinese high-school student would not. Understanding by a simulated learner is therefore evidence about page logic, not direct evidence of human comprehensibility.
2. **Objective leakage.** The task wording, prior reports, source code, or visible answer text may reveal what the lab is meant to teach.
3. **Prior-knowledge contamination.** A learner may answer from pretrained computing knowledge rather than from the rendered page.
4. **Browser automation artifact.** A click, slider, focus, viewport, or timing failure may be caused by the browser harness rather than the product.
5. **Transfer-test contamination.** A post task may be too similar to the fixture, or the learner may search the page for the answer after the study.

## Learner roles

Each pass must label evidence as:

- **SAW:** directly visible or read on the rendered page;
- **KNEW:** present in the frozen pre-test or prerequisite packet;
- **INFERRED:** a conclusion from SAW/KNEW evidence;
- **UNJUSTIFIED:** cannot be supported from the allowed page and packet.

Required roles:

- **Knowledge-denied:** may use only the page and the small operational packet below. Must say “I cannot justify this from the page” instead of supplying missing domain knowledge.
- **Lossy reader:** has a fixed five-minute budget and at most eight meaningful interactions; scans the first viewport, headline, dominant visual, and obvious controls; does not exhaustively read, reopen every explanation, use page search, or search for answers after transfer.
- **Impatient explorer:** acts quickly, skips optional prose/prediction when possible, and reports what would be missed in a classroom.
- **Careful low-prior:** reads enough to avoid random guessing, records evidence, and flags ambiguous words.

**Packet 0 — supplied before every exploration:** “Use the rendered page only. You may click, type, choose, step, and run. A trace or table may show what changed. Do not use outside facts. If the page does not establish a meaning, mark it UNJUSTIFIED.” Packet 0 contains no lab-specific facts.

**Packet 1 — supplied only immediately before a specifically tagged prerequisite-dependent transfer item, never before exploration:** `1 simulated tick = 30 ms` for timing arithmetic; and for the optional Audio folding calculation, when a frequency is above half the sample rate, the observable alias is `sample rate − frequency` for the tested range. Packet 1 tests application of a supplied rule, not whether the lab taught that rule. Scores from Packet 1 items are reported separately and excluded from PRE→POST learning claims.

## Frozen pre-test

Pre-test happens before opening the target lab. The learner answers without browsing or looking up facts. Score each item 0 = wrong/no basis, 1 = partial/uncertain, 2 = correct with a defensible reason.

### Protocol Process

P1. A sender sends a message but hears nothing before its deadline. What, exactly, can the sender conclude?
P2. The same labeled message arrives twice. How many application actions must happen? What information is needed to decide?

### Audio Encoding

A1. What might change when a measurement system takes measurements more often?
A2. What might change when each measurement can use more allowed levels? Do not name a term unless you can explain it.

### Relational Data

R1. Is an empty text value the same as a missing value? Why?
R2. If a row refers to a parent row that does not exist, what should a count or joined result do? State uncertainty if the rule is unknown.

### Program Execution

G1. Trace: `x = 1; x = x + 2; print x`. What prints?
G2. In `while x < 2: x = x + 1`, when does the body stop running? Show the checks you think happen.

### Two's Complement

T1. In four bits, what numbers could `1000` represent under two different readings?
T2. What do you expect from `0111 + 0001` in a four-bit machine? Distinguish stored bits from any extra information.

## Transfer evidence classes

Every post/transfer item is tagged:

- **PAGE-GROUNDED:** answerable from visible evidence and the operational packet;
- **PREREQUISITE-DEPENDENT:** requires a mapping or fact supplied in the packet;
- **OUT-OF-SCOPE:** the rendered page does not establish the rule. Do not count this as learning failure or success.

Examples: Protocol millisecond arithmetic is PREREQUISITE-DEPENDENT unless `1 tick = 30 ms` is supplied; relational typed-import behavior is OUT-OF-SCOPE for the current lab; Audio aliasing calculations are PREREQUISITE-DEPENDENT unless the packet supplies the frequency-folding rule.

## Frozen post/transfer tasks

Use structurally similar but unseen tasks after exploration. Do not reopen the page to answer. Record answer, reason, evidence citation, and confidence.

- Protocol: (1) **PREREQUISITE-DEPENDENT**: with Packet 1, 30 ms one-way data and immediate ACK: when does sender know? (2) **PREREQUISITE-DEPENDENT**: with Packet 1, first data lost, timeout 100 ms, retry reaches at 140 ms: delivery count and sender success time? (3) **PAGE-GROUNDED**: first data arrives at tick 2, ACK released at tick 4, retry arrives at tick 5: first success time and application delivery count?
- Audio: (1) **PAGE-GROUNDED**: compare raw payload of 24 kHz/8-bit with 48 kHz/16-bit; (2) **PREREQUISITE-DEPENDENT**: with the packet’s folding rule, 18 kHz sampled at 30 kHz: what wrong frequency appears and which knob fixes it? (3) **PAGE-GROUNDED**: say which knob changes amplitude precision.
- Relational: (1) **PAGE-GROUNDED**: distinguish `NULL` and `""` in a filter; (2) **OUT-OF-SCOPE** for this lab: import string values `"21"`, `""`, `"23"`, `NULL` into an integer foreign key; (3) **OUT-OF-SCOPE** unless a new packet is provided: compute driver/tip totals where one tip is orphaned and one is NULL.
- Program: (1) trace `x=2; for i=1..3: x=x+i; print x`; (2) explain a branch whose condition is checked before the body; (3) identify why a final false check appears in the trace.
- Two's Complement: (1) decode `11100101` as signed 8-bit; (2) compute `11100010 + 00100110` including stored result and carry; (3) explain whether `10011100 + 10100111` fits as a signed 8-bit result.

## Per-pass record

Record first impression, first click, visible text actually attended to, action sequence, skipped controls, hesitation, surprise, hypothesis, model change, teach-back, SAW/KNEW/INFERRED/UNJUSTIFIED labels, and the exact post answer.

Report:

`PRE score → POST score → DELTA`, plus separate scores for interaction discoverability, language comprehensibility, mechanism learning, transfer, and teacher dependence. A correct post answer with no baseline improvement is not called learning.

## Human-language critic protocol

Run a separate critic who must not solve the computer-science task. For each important rendered string, record the exact copy and answer:

- Who is the grammatical subject?
- What does each “it/this/result/state” refer to?
- How many new concepts appear in one sentence?
- Is the term explained before it is used?
- Why is the term needed at this moment?
- Could a 15–17-year-old understand it without already knowing the lesson?
- Which causal step is omitted?
- Is the sentence written for a developer/LLM rather than a student?
- Would a concrete sentence be clearer?
- Does English add curriculum value here?

Critic output: `docs/archive/research/learner-studies-v2/human-language-critic.md`, with severity, exact rendered copy, suggested Chinese rewrite, and whether the issue is copy-only or changes the learning sequence.

## Evaluation rule

Classify each simulated finding as **HIGH CONFIDENCE SIMULATED HUMAN-LANGUAGE ISSUE**, **MEDIUM CONFIDENCE SIMULATED ISSUE**, **LIKELY LLM/AUTOMATION ARTIFACT**, or **NOT REPRODUCED**. Only a real human pre-flight may upgrade a simulated issue to a human issue. Keep human-language comprehension separate from domain correctness. Product changes wait until the calibration report names the 3–5 highest-leverage labs.

## Delivery ledgers

Maintain two explicit ledgers:

- **Copy/accessibility ledger:** all routes and shell surfaces receiving Chinese copy, `aria-label`, alt text, live-region, document language, or wrapping cleanup.
- **Behavior ledger:** no more than 3–5 labs receiving pedagogical/interaction changes. Copy-only changes do not count toward this limit.

Include `index.html` in the copy/accessibility scope and verify `html[lang="zh-CN"]`, title, meta description, accessible names, captions, and live-region messages.
