# Long-term primitive foundation research

**Status:** architecture research only. No production feature was refactored and no shared lesson primitive was introduced.

## Executive conclusion

The repository does **not** yet justify a new shared interactive-learning component, lesson runtime, or domain framework.

That conclusion survives a deliberately broader investigation than the previous review:

- four heterogeneous implemented courses were read as empirical evidence;
- the prior extraction review and its rejected proposals were treated as constraints to challenge, not doctrine;
- the plausible high-school Information Technology experiment space was expanded beyond the current courses;
- independent bottom-up, curriculum-space, abstraction-skeptic, future-course-author, and missed-family investigations were run;
- candidate contracts were stress-tested against deliberately different future courses rather than against similar-looking screens.

The strongest long-term foundation is a **small hierarchy of contracts**, not a package of reusable lesson widgets:

### PROVEN NOW

1. **App shell composition** — `LabShell` owns chrome and accessibility, while the feature owns the workspace. This is a design-system/application contract, not a lesson primitive.
2. **Opaque initial-scenario transport** — the app transports search state without interpreting lesson semantics; each feature parses, normalizes, serializes, and resets its own scenario.
3. **Feature-owned deterministic model boundary** — each feature has a pure domain model, a feature-owned lesson state transition function, and a UI that projects state/evidence. This is an architectural/testing contract, not a generic `LessonModel<T>`.
4. **Inspectable evidence contract** — pedagogically meaningful state must be exposed as explicit, testable evidence (text, tables, semantic SVG/canvas alternatives, labeled controls, and model assertions), not only color or animation. This is a learning/test contract, not a shared renderer.

### PROVISIONAL / HIGH-CONFIDENCE

1. **Immutable inspectable causal traces** — a narrow data/evidence schema for ordered, deterministic frames. It should not own execution, playback, scheduling, or rendering.
2. **Versioned deterministic random streams** — a pure domain primitive for reproducible stochastic experiments, likely valuable for Monte Carlo, randomized algorithms, sensor noise, and data sampling. It needs real consumers before extraction.
3. **Pure discrete-step results** — a possible model-level contract for experiments whose state advances one explicit deterministic step at a time. It is not a `Stepper` component or runtime.
4. **Prediction → intervention → observation → evidence** — a high-confidence learning contract, but currently a lesson-authoring convention rather than a shared runtime or assessment widget.

Everything else is **WATCH** or **REJECTED** until future course implementations provide compatible evidence. In particular, the work does **not** support `LessonRuntime`, `ExperimentEngine`, `VisualizationFramework`, `ScenarioCodec`, `ParameterPanel`, `BitGrid`, `DataTable`, `Validator`, `Comparator`, or a universal `Stepper`.

The most valuable next action is to implement a fifth, deliberately feature-local reference course: **program execution and loop/variable tracing**. It has maximum information value for trace, discrete-step, prediction, invariant, accessibility, and authoring hypotheses without being a disguised copy of Image, Audio, Network, or Two's Complement.

---

## 1. Method and evidence base

### Repository evidence inspected

The investigation read:

- `src/app/**` routing, catalog, error isolation, boundary tests, and router helpers;
- `src/shared/lab/**`, including `LabShell`, navigation, legacy lesson-looking components, and tests;
- all four implemented courses under `src/features/**`:
  - `image-encoding`;
  - `audio-encoding`;
  - `home-network`;
  - `twos-complement`;
- domain, lesson, UI, unit, integration, and end-to-end tests;
- `docs/architecture.md`;
- `docs/retired-labs.md`;
- the historical research inventory, candidate pool, precedent research, and interaction-primitive registry.

The working tree was clean at the start of the research. The previous extraction review reports that lint, typecheck, unit tests, and production build passed; its E2E run was blocked only by a missing local Playwright Chromium cache. This report does not treat those historical verification results as proof that a new abstraction exists.

### Independent reasoning passes

The investigation intentionally preserved disagreement:

- **Bottom-up repository investigator:** reconstructed actual state ownership, transitions, evidence models, URL semantics, browser boundaries, and test contracts.
- **Top-down curriculum investigator:** mapped representation, algorithms, programming, networks/protocols, data systems, sensing/control, AI/data, cybersecurity, and missing families.
- **Abstraction skeptic:** attempted to delete or shrink every proposed primitive, looking for callback soup and semantic leakage.
- **Future course author:** tried to use candidate APIs for courses 5, 10, and 20 and estimated conceptual as well as implementation cost.
- **Missed-family investigator:** searched for evidence/provenance, deterministic replay, accessibility, inspection, perturbation, persistence, spatial mapping, and other families that ordinary component extraction misses.

The investigators agreed on the current rejection of broad shared lesson infrastructure, but disagreed about how soon narrow trace, seeded-randomness, and inquiry contracts might become worthwhile. That disagreement is retained below.

### Discipline used

A candidate was not considered reusable merely because:

- two screens use cards, sliders, tabs, grids, SVG, or a timeline;
- code is duplicated;
- the same English word appears in two lessons (`phase`, `status`, `error`, `reset`, `probe`, or `step`);
- a generic type can be written with enough `T` parameters;
- a render-prop API can make two examples compile;
- a configuration object can encode every course-specific branch.

A candidate needed a stable invariant and compatible transitions across materially different consumers, while preserving local pedagogy and making correctness easier to test.

---

## 2. Map of the future computing-lab interaction/domain space

The following is a representative map, not a course backlog. It is organized by the kind of state/evidence relationship a course must preserve, not by the textbook's chapter order.

| Curriculum family                     | Representative future experiments                                                                                              | Recurring interaction/evidence                                                                                               | What is genuinely domain-local                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Numeric and finite representation** | binary/hex, positional weights, two's complement, fixed-width arithmetic, floating-point range/rounding, checksums/error codes | edit finite symbols; show interpretation, range, carry, overflow, or code; compare the same pattern under different readings | word width, signed interpretation, carry rules, floating-point format, checksum polynomial |
| **Text and character encoding**       | ASCII, Unicode code points, UTF-8, legacy encodings, malformed byte sequences, normalization                                   | source character → code point → bytes → decoded text; inspect byte boundaries; perturb one byte and explain failure          | encoding table, continuation-byte rules, normalization semantics, replacement/error policy |
| **Image and visual encoding**         | sampling, quantization, palette/indexing, run-length compression, image formats                                                | source → sampled representation → encoded values → reconstruction/error; spatial coordinate inspection                       | pixel geometry, palette selection, perceptual loss, file/container rules                   |
| **Audio and signal encoding**         | sampling, quantization, aliasing, lossless/lossy compression, frequency analysis                                               | change signal/configuration; observe waveform, samples, reconstructed signal, error, and possibly sound                      | time axis, playback lifecycle, frequency model, hearing interpretation, codec assumptions  |
| **Compression and information**       | run length, Huffman-like codebooks, dictionary compression, entropy examples                                                   | edit/source data; build or inspect codebook; compare encoded length and reconstruction; identify losslessness                | codebook construction, probability model, dictionary/window semantics, metric choice       |
| **Logic and digital circuits**        | Boolean expressions, gates, truth tables, adders, multiplexers, finite-state circuits                                          | toggle inputs; trace intermediate gate outputs; inspect truth-table rows and circuit propagation                             | circuit topology, gate delay model, logic family, algebraic simplification                 |
| **Algorithms**                        | linear/binary search, sorting, recursion, graph search, greedy choice, complexity                                              | edit input; step through a deterministic execution; inspect invariant, comparisons, swaps, queue/stack, and result           | algorithm control flow, tie-breaking, cost metric, data structure semantics                |
| **Program execution**                 | variables, assignment, loops, conditionals, functions, scope, debugging                                                        | execute one statement/iteration; inspect environments, branch conditions, output, and termination; predict before reveal     | language grammar, evaluation order, scope/aliasing, runtime errors, call-stack model       |
| **Tables and data systems**           | schema design, types/constraints, filtering, joins, grouping, aggregation, query plans, provenance                             | edit rows/schema/query; expose derived rows/cells and reasons; preserve source-to-result lineage                             | relational semantics, nulls, type coercion, join cardinality, aggregation rules            |
| **Networks and addressing**           | binary addressing, subnetting, CIDR, routing tables, packet forwarding, NAT                                                    | edit addresses/routes; predict local/remote/path; inspect each hop and first failure                                         | routing policy, ARP, NAT, TTL, subnet math, topology, protocol layer                       |
| **Protocol processes**                | DNS, HTTP request/response, TCP-like reliability, retries, ordering, caching                                                   | intervene in messages/timing/faults; step through causal events; inspect headers, timers, and outcomes                       | protocol state machine, timeout/retry rules, cache policy, loss/reordering model           |
| **Information-system data flow**      | sensor → storage → transform → dashboard, ETL, provenance, access control                                                      | perturb one source/transform; follow lineage and derived values; compare before/after                                        | schema evolution, source quality, provenance semantics, aggregation, permissions           |
| **Sensors and IoT**                   | ADC, sensor noise, calibration, sampling, thresholding, feedback control                                                       | vary input/noise/threshold; run a clocked closed loop; observe state, actuator, error, safety                                | plant model, noise distribution, controller, delay, saturation, safety policy              |
| **AI/data experiments**               | feature/vectorization, threshold classifiers, confusion matrix, bias/shift, train/test split                                   | edit data/threshold; inspect intermediate representation and per-example outcome; compare populations                        | model family, metric, data-generating process, calibration, fairness definition            |
| **Cybersecurity**                     | password search space, authentication, hashing, access control, trust boundaries, injection, detection                         | change secret/attack/configuration; observe evidence, violated guarantee, and response; compare threat models                | adversary model, cryptographic primitive, trust boundary, detection rule, threat severity  |
| **Human/data/social context**         | data collection quality, privacy, visualization choices, ethical trade-offs                                                    | classify/compare scenarios and evidence; inspect assumptions and consequences                                                | normative judgment, context, policy, consent, interpretation; often not a simulator at all |

### Important cross-cutting families

The map reveals recurring _questions_, but not necessarily reusable code:

1. **What is the current state?** A word, raster, signal, packet path, table, runtime environment, controller state, or dataset.
2. **What intervention is permitted?** Toggle a bit, edit an address, change a parameter, inject a fault, choose a route, alter a query, or advance a clock.
3. **What rule changes the state?** This is usually domain-specific and is the strongest boundary against genericization.
4. **What intermediate evidence makes the rule learnable?** A carry column, sampled cell, packet event, variable environment, query lineage, or gate output.
5. **What can be selected and inspected?** This is recurring, but the selected object and its explanation are not interchangeable.
6. **What can be compared?** Before/after, original/reconstructed, predicted/observed, local/remote, valid/invalid, or two parameter regimes. The comparison relation is domain-owned.
7. **Is time real, simulated, or absent?** Audio has playback time; Network currently has causal event order but no wall-clock; Image and Two's Complement are static; control and reliability need a deterministic clock.

These dimensions are useful for experimental design. They are not evidence for a universal runtime.

---

## 3. What the four real courses actually prove

| Course               | Feature-owned state and transitions                                                                                                                                                                                                                                                           | Invariant/evidence contract                                                                                                                                                                                                           | Why visual similarity is misleading                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Image Encoding**   | `ImageLessonState` owns source raster, sampling percentage, bit depth, phase, view, selected coordinate, upload/decode errors, and reset baseline. Parameter changes derive a sampled representation, palette/index representation, reconstruction, error map, payload, and pixel inspection. | Sampling geometry is authoritative per axis; reconstruction uses sampled/quantized cells, not CSS resize; every index has exactly `bitDepth` bits; inspection follows source coordinate → sample cell → palette entry → encoded bits. | It has a grid and sliders, but its central operation is spatial mapping and finite color representation. It has no global completion state, clock, event trace, or validation workflow.                                  |
| **Audio Encoding**   | `SoundLessonState` owns source/config, transport, audition, cursor, loop, mode, view, and reset baseline. Explicit `tick`, `seek`, play/pause/stop, loop wrapping, and browser playback runtime are separate concerns.                                                                        | Sample count, quantization codes, reconstructed signal, aliasing classification, cursor readout, sample error, continuous reconstruction error, and payload are different evidence.                                                   | It has parameters and plots, but it has real time, WebAudio lifecycle, cursor semantics, audition A/B, and continuous-vs-sample error. A generic slider/panel/clock would leak sound assumptions.                        |
| **Home Network**     | `HomeNetworkLessonState` owns mutable device configuration, source/target, prediction, immutable probe history, per-probe predictions, selected trace, and selected event. A probe snapshots configuration and generates causal events.                                                       | Address validation, locality classification, ARP/route/NAT-like events, first failure, endpoint correctness, and history comparison are typed facts. History must remain immutable after later edits.                                 | It has an inspector and a trace, but its transitions are configuration edits → a domain probe, not frame-by-frame playback. The selected event and first-failure semantics are network-specific.                         |
| **Two's Complement** | `TwosComplementLessonState` owns fixed-width words, reading, width, initial URL scenario, and bit toggles/examples. Width changes sign-extend or zero-extend according to the active reading.                                                                                                 | Ripple columns, stored low word, carry-out, carry-into-sign, signed/unsigned interpretations, ranges, and two distinct overflow predicates are cross-checked by exhaustive tests.                                                     | It has bit-shaped controls, but it is an editable finite word and arithmetic proof. Image's pixel cells are passive 2D samples; a generic `BitGrid` would erase width, reading, carry direction, and overflow semantics. |

### Current common contracts are boundaries, not lesson abstractions

All four courses support a valuable local structure:

```text
domain facts/calculations
        ↓
feature lesson state + feature transitions
        ↓
feature UI and accessible evidence
```

That structure is proven as an **ownership rule**. It is not evidence for a shared interface such as:

```ts
type LessonRuntime<State, Action, Model, Scenario> = {
  state: State;
  dispatch(action: Action): void;
  model: Model;
  scenario: Scenario;
};
```

Such an interface would merely rename four different state machines and invite the runtime to own reset, URL hydration, status, clock, or layout policies.

---

## 4. Full candidate matrix

The matrix distinguishes design-system/UI (A), interactive-learning/evidence (B), and domain/simulation (C). “Compatible” means the same meaningful state-transition contract survives, not that a generic component can render both.

| Candidate                                          | Layer              | Plausible consumers                                                                           | Compatibility test                                                                                                                | Verdict                                   |
| -------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `LabShell` / catalog navigation                    | A                  | all four current courses and future routes                                                    | Same app chrome, focus return, responsive rail, landmark ownership; children remain opaque                                        | **PROVEN NOW**                            |
| Opaque route search transport                      | A / infrastructure | all four current courses                                                                      | Router passes values; feature-local parser owns schema, clamping, canonicalization, and transient state                           | **PROVEN NOW**                            |
| Feature-owned pure model + transition boundary     | B/C architecture   | all four current courses                                                                      | `derive` and `transition` are pure and independently tested, but types remain feature-local                                       | **PROVEN NOW**                            |
| Accessible evidence projection/test contract       | B / test           | audio readouts, network traces, image grid/inspector, carry/overflow cards                    | Meaningful claims appear in roles/text/tables/semantic SVG or keyboard paths and are tested against model facts                   | **PROVEN NOW**                            |
| Immutable ordered causal trace data                | B                  | program execution, sorting/search, protocol exchange, network probes, formula evaluation      | Each frame is deterministic, ordered, inspectable, and complete enough to explain a transition; no domain semantics in the schema | **PROVISIONAL**                           |
| Trace cursor/selection state                       | B / UI contract    | trace table, algorithm execution, protocol event list, query-plan steps                       | Only controlled index/ID selection is shared; trace generation and rendering stay local                                           | **PROVISIONAL, narrower than `Stepper`**  |
| Pure discrete-step result                          | C/B                | loop execution, packet forwarding, state-machine circuit, clocked control                     | One explicit step returns next state plus evidence and termination; no scheduler, animation, or action flags                      | **PROVISIONAL**                           |
| Versioned seeded random stream                     | C                  | Monte Carlo, randomized search, sensor noise, dataset sampling                                | Same seed + algorithm version produces the same sequence; randomness is explicit input, not hidden global state                   | **PROVISIONAL**                           |
| Prediction → intervention → observation → evidence | B / lesson         | network diagnosis, encoding prediction, control hypothesis, classifier threshold, compression | Prediction changes what the learner investigates; it is optional and not a generic quiz/submit workflow                           | **PROVISIONAL as a design contract**      |
| Representation transformation path                 | B/C                | text, image, audio, compression, protocol payload, data provenance                            | Every stage and relation must preserve domain-specific mapping/loss; a generic stage list is too weak                             | **WATCH**                                 |
| Editable finite representation                     | B                  | bits, bytes, code points, pixels, table cells, gates                                          | Editable symbols have radically different rules, selection dimensions, and pedagogical meanings                                   | **WATCH; reject shared `BitGrid`**        |
| Coordinate-to-representation inspection            | B                  | image pixel, audio cursor, source byte, packet field, table lineage                           | A selected point maps to intermediate values, but coordinate systems and mapping cardinality differ                               | **WATCH**                                 |
| Table with derived/selected cells                  | A/B                | relational queries, spreadsheets, confusion matrices, truth tables, algorithm state tables    | Tables share appearance but not derivation, selection, sorting, editing, null, or provenance semantics                            | **WATCH**                                 |
| Graph/node-edge model                              | C                  | topology, routing, dependency graphs, circuits, control flow                                  | Node/edge state, path semantics, and allowed mutations differ                                                                     | **WATCH**                                 |
| Pipeline/data-flow model                           | B/C                | encoding chains, ETL, protocol layers, sensor pipelines                                       | Pipeline stages may be reversible, lossy, concurrent, or merely explanatory; no common transition yet                             | **WATCH**                                 |
| Before/after comparison model                      | B                  | original/reconstructed audio/image, repaired network, query output, classifier threshold      | “Difference” requires a domain metric and explanation; generic diff data becomes opaque                                           | **WATCH**                                 |
| Parameter sweep/sensitivity                        | B                  | encoding quality, algorithm complexity, control tuning, classifier threshold                  | Sweep may mean independent scenarios, live coupling, statistical replication, or optimization                                     | **WATCH**                                 |
| Controlled perturbation/fault injection            | B                  | network faults, protocol loss, sensor noise, malformed encoding, security attacks             | Perturbation semantics and safety bounds are domain-owned; common part is only experimental intent                                | **WATCH**                                 |
| Invariant/range violation evidence                 | B/C                | overflow, invalid IP, schema constraint, malformed UTF-8, safety threshold                    | Violations can be mathematical facts, input issues, safety hazards, or explanatory counterexamples                                | **WATCH**                                 |
| Provenance/lineage                                 | B/C                | data flow, query joins, image pixel mapping, encoded bytes, ML features                       | “Derived from” may be one-to-one, many-to-one, spatial, temporal, or probabilistic                                                | **WATCH**                                 |
| Deterministic simulation clock                     | C                  | protocol retry, control loop, algorithm animation, Monte Carlo batches                        | Current Audio clock is playback-specific; future simulations may need event queues, delays, or continuous time                    | **WATCH; do not share now**               |
| Formula/expression evaluator                       | C                  | formula tracing, query expressions, conditionals, arithmetic                                  | Grammar, safety, intermediate values, and error semantics differ; a shared evaluator becomes a language project                   | **REJECTED for now**                      |
| Generic validator / `issues[]` renderer            | B                  | IP validation, schema constraints, malformed bytes, safety checks                             | Issue severity, first failure, correction timing, and ownership differ; generic issue taxonomies leak semantics                   | **REJECTED**                              |
| Generic inspector component                        | A/B                | pixel inspector, event inspector, variable inspector, byte inspector                          | The selected object's explanation is the lesson; slots/callbacks would own no invariant                                           | **REJECTED as learning primitive**        |
| `ParameterControl` / `ParameterPanel`              | A                  | sliders/selects/text inputs in nearly every future course                                     | Shared mechanics are design-system controls; labels, ranges, units, coupling, and semantics are feature-owned                     | **A-only UI reuse; reject B promotion**   |
| `BitGrid` / `BinaryNumber`                         | A/B/C              | two's complement, binary/hex, UTF-8 bytes, pixels, gates                                      | Same cells do not imply same transition, dimension, interpretation, or evidence                                                   | **REJECTED**                              |
| Generic `Comparator`                               | B                  | source/reconstruction, before/after, parameter A/B                                            | Comparison metric and explanation are domain facts; a generic diff view is a black box                                            | **REJECTED**                              |
| Universal `Stepper` / playback controller          | B/C                | algorithm trace, audio, protocol, formula, batch simulation                                   | Playback, cursor, rewind, tick, batching, branch history, and termination differ                                                  | **REJECTED; trace data is narrower**      |
| Generic `ScenarioCodec`                            | A/B                | URL state for every course                                                                    | Parsers have different defaults, legacy compatibility, transient state, and canonicalization                                      | **REJECTED**                              |
| Generic status/workflow/reset runtime              | B                  | old ready/editing/success/failure model                                                       | Image and Two's Complement explicitly have no submit workflow; Network reset differs from Audio transport reset                   | **REJECTED**                              |
| Shared event bus / global clock                    | C                  | audio, protocols, control, animations                                                         | It couples unrelated feature lifecycles and makes deterministic tests harder                                                      | **REJECTED**                              |
| `VisualizationFramework` / chart family            | A/B                | plots, heatmaps, graphs, timelines                                                            | Rendering primitives can be design-system code, but scales, marks, interaction, and evidence remain local                         | **REJECTED as B; selective A reuse only** |
| Configuration-driven lesson DSL                    | B/C                | all future courses in theory                                                                  | Configuration becomes a hidden programming language and callback soup                                                             | **REJECTED**                              |
| Generic drag/drop builder                          | A/B                | circuits, schemas, queries, flowcharts                                                        | Dragging is an input technique, not a shared learning invariant; keyboard/a11y costs are high                                     | **REJECTED**                              |

---

## 5. PROVEN NOW contracts

These are the only contracts for which production reuse is defensible today. They are intentionally small and mostly non-semantic.

### 5.1 App-shell composition (`LabShell`)

**Classification:** A — design-system/application boundary, not an interactive-learning primitive.

**Exact responsibility**

- render the top bar, catalog rail, mobile menu/scrim, focus return, inert closed navigation, and the landmark `<main>`;
- expose course identity through `eyebrow`, `title`, and `subtitle`;
- render the feature workspace as opaque `children`.

**Non-responsibilities**

- no lesson state, formula, status, phase, workflow, clock, reset, validation, URL schema, or evidence layout;
- no fixed controls/visualization/explanation slots;
- no knowledge of image, audio, network, arithmetic, or future domain nouns.

**Minimal conceptual API**

```tsx
type LabShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};
```

**State/invariant contract**

- shell state is only app navigation state (`railOpen`, `isMobile`);
- closed mobile navigation is inert and hidden from assistive technology;
- Escape closes the rail and returns focus to the menu button;
- feature content is inside exactly one app-owned main landmark.

**Materially different consumers**

- Image's source/reconstruction/inspector workspace;
- Audio's playback/analysis workspace;
- Network's topology/configuration/causal trace workspace;
- Two's Complement's bit arithmetic workspace.

They are compatible because they consume only chrome and landmark ownership, not because their workspaces have the same layout.

**Counterexamples**

Any “lesson shell” with slots for controls, visualization, formula, status, or actions should not use this contract. A feature that needs a full-screen canvas, a multi-column inspector, or a narrative page can still use the app shell but owns its internal composition.

**Ownership/location**

`src/shared/lab/LabShell.tsx` and `src/shared/lab/lab.css`, with app navigation supplied through `LabNavigationProvider`.

**Testing strategy**

- shell unit tests for mobile menu, Escape, focus return, inert behavior, and landmark;
- architecture-boundary test preventing imports from app/features;
- each feature UI test verifies that its workspace remains inside `<main>` and does not depend on legacy slots.

**Accessibility implications**

This is where common accessibility ownership is appropriate: landmarks, menu semantics, focus return, inert state, and keyboard close behavior.

**Extraction trigger / deletion condition**

Already met: it has four heterogeneous consumers and a stable chrome invariant. Delete or shrink only if the application ceases to have a common shell or the component starts accumulating feature slots.

**Expected future effect**

New courses begin with a stable route/chrome boundary and retain complete freedom inside it. It reduces integration cost without reducing pedagogical freedom.

**Adjacent proven app contracts**

The same evidence supports three small contracts that should remain separate rather than being folded into `LabShell`:

- `LabNavigationProvider` supplies catalog-shaped navigation items without importing feature semantics;
- `src/test/router-test-helpers.tsx` provides route-aware mounting/navigation for integration tests without knowing lesson state;
- `src/app/architecture-boundaries.test.ts` enforces public feature entrypoints, `domain → lesson → ui`, and no shared-to-feature imports.

`src/design/tokens.css` and `src/design/base.css` are also proven A-layer reuse: they share color, spacing, focus, typography, and base styling only. None of these contracts should become a B-layer evidence or lesson primitive.

---

### 5.2 Opaque initial-scenario transport

**Classification:** A — application/infrastructure contract.

**Exact responsibility**

- let the router carry arbitrary search values to a route;
- let each feature interpret only its own initial scenario;
- permit teacher-shareable, reproducible URLs where a feature chooses to support them.

**Non-responsibilities**

- no shared field names or defaults;
- no generic clamp/enum parser;
- no synchronization of every transient interaction;
- no shared reset semantics;
- no assumption that an uploaded image, playback cursor, probe history, or selected event belongs in the URL.

**Minimal conceptual API**

The proven app-level API is deliberately opaque:

```ts
export const passThroughSearch = (search: Record<string, unknown>): Record<string, unknown> =>
  search;
```

A feature may locally define `parseScenario` and `serializeScenario`; those functions should not implement a shared interface unless future evidence requires one.

**State/invariant contract**

- malformed initial values normalize at the feature/domain boundary;
- reset returns to the feature's initial URL scenario, not a hidden global success profile;
- transient state may remain local and unsynchronized.

**Materially different consumers**

- Image serializes fixture, sampling, phase, bits, and view while keeping uploaded pixels transient;
- Audio serializes source/configuration/mode/view/loop but keeps playback lifecycle local;
- Network serializes scenario and target while probe history and edits are local;
- Two's Complement serializes width, words, and reading.

**Counterexamples**

Do not create `ScenarioCodec<T>` with shared defaulting, legacy aliases, clamping, or transient-state rules. Image's phase canonicalization depends on raster geometry; Audio's loop depends on duration; Network's scenario expands a preset; Two's Complement normalizes fixed-width words.

**Ownership/location**

App route definitions in `src/app/router.tsx`; feature-local parsers/serializers in each `lesson/scenario.ts`.

**Testing strategy**

Parser/serializer round trips and malformed-value tests per feature; router integration tests for direct links and search hydration; explicit tests for what remains transient.

**Accessibility implications**

A shareable URL must hydrate the same accessible labels and evidence, but URL transport itself should not replace visible explanatory state.

**Extraction trigger / deletion condition**

Already met as an app contract. Promote a codec only if two independently designed features need the exact same schema semantics, including defaults, canonicalization, legacy behavior, and transient-state policy. Delete any proposed codec if it requires callbacks for those policies.

**Expected future effect**

Teachers can share reproducible starting conditions without forcing every lesson into a common state machine.

---

### 5.3 Feature-owned deterministic model boundary

**Classification:** B/C — architecture and test contract; not a shared lesson package.

**Exact responsibility**

Each feature should keep:

```ts
// Feature-local names and types.
function deriveModel(input: DomainInput): DomainModel;
function transition(state: LessonState, action: LessonAction): LessonState;
```

The domain owns mathematical/computational facts; the lesson owns scenario, transient state, and transitions; the UI composes controls and evidence.

**Non-responsibilities**

- no common state shape;
- no common action union;
- no common reset/clock/status/submit policy;
- no React, router, or browser API in domain/lesson;
- no shared domain nouns disguised as generic type parameters.

**State/invariant contract**

- domain derivation is deterministic and independently testable;
- lesson transitions preserve feature invariants and make invalid input behavior explicit;
- UI does not reimplement calculations as a second oracle.

**Materially different consumers**

- Image derives geometry, palette, indices, reconstruction, and pixel error;
- Audio derives samples, quantization, aliasing, cursor readouts, and playback remains a separate browser runtime;
- Network derives packet/probe events and snapshots configuration for history;
- Two's Complement derives ripple columns, interpretations, ranges, and overflow relationships.

**Counterexamples**

A generic `Model<State>` or `ExperimentEngine` that owns all these concerns would either be too weak to express invariants or acquire callbacks/flags for every difference.

**Ownership/location**

Feature-local `domain/`, `lesson/`, and `ui/`, enforced by `src/app/architecture-boundaries.test.ts`.

**Testing strategy**

- domain tests assert invariants and independent oracles;
- lesson tests assert transitions, reset baselines, immutability, and malformed inputs;
- UI tests assert rendered evidence against model outputs;
- boundary tests prevent cross-layer imports.

**Accessibility implications**

A deterministic model makes it possible to render equivalent text/table evidence and to test that screen-reader-visible claims match the domain, rather than relying on animation timing or visual pixels.

**Extraction trigger / deletion condition**

Keep as an architectural rule. Do not extract a shared implementation. Shrink the rule only if a future course demonstrates that domain and lesson semantics genuinely cannot be separated without weakening correctness.

**Expected future effect**

New courses begin from a testable ownership boundary and avoid the historical failure where pre-existing shared components dictated the teaching model.

---

### 5.4 Inspectable evidence and accessibility/test contract

**Classification:** B — interactive-learning/evidence contract and test discipline.

**Exact responsibility**

Every meaningful student-facing claim should have an inspectable evidence representation that is:

- derived from the same model as the visual result;
- accessible without color alone;
- reachable by keyboard where the interaction is not native;
- present as labeled text, table, semantic SVG, role/state, or another explicit representation;
- testable by role/text/data attributes and model assertions.

**Non-responsibilities**

- no common evidence card or inspector renderer;
- no universal color/status vocabulary;
- no mandate that every course expose a trace, formula, chart, or prediction;
- no automatic grading or completion state.

**Minimal conceptual API**

This is deliberately a checklist/test contract rather than a shared component:

```ts
type EvidenceContract = {
  claim: string;
  source: "domain-model" | "lesson-state";
  accessibleRepresentation: "text" | "table" | "semantic-svg" | "keyboard-inspectable";
  testOracle: string;
};
```

The type is illustrative and should not be added to production solely for naming the rule.

**Materially different consumers**

- Audio exposes cursor readout, sample statistics, aliasing evidence, and live status;
- Network exposes event chain, first failure, packet fields, and history comparison in text as well as SVG;
- Image exposes an accessible sampled grid, encoded bits, pixel inspector, payload, and error map;
- Two's Complement exposes bit button names, ripple columns, signed/unsigned interpretations, and separate carry/overflow cards.

**Counterexamples**

A purely visual animation, a canvas with no keyboard/text alternative, a color-only valid/invalid grid, or a generic inspector whose content is supplied by arbitrary render props fails this contract.

**Ownership/location**

Feature UI and tests; common shell accessibility remains in `src/shared/lab`. Add authoring guidance to design/research docs, not a renderer package.

**Testing strategy**

Model tests assert facts; UI tests query semantic roles and explanatory text; E2E tests follow a learner trajectory without recomputing a second oracle; architecture tests enforce boundaries.

**Accessibility implications**

This contract is explicitly about screen-reader output, keyboard operation, focus visibility, labels, live regions, and non-color explanations.

**Extraction trigger / deletion condition**

Already proven as a cross-course quality gate. A shared evidence data structure is not justified unless two courses expose the same evidence shape and interaction semantics without slots or callbacks.

**Expected future effect**

A new course must make intermediate state inspectable and testable, preventing “beautiful but uncheckable” visualizations without prescribing its pedagogy.

---

## 6. PROVISIONAL / HIGH-CONFIDENCE candidates

These are intentionally **not** production extractions. Each has enough future evidence to deserve a concrete hypothesis and a gate, but not enough current compatible consumers.

### 6.1 Immutable inspectable causal trace

**Classification:** B — evidence primitive; possibly a small pure data schema.

**Exact responsibility**

Represent an ordered, deterministic sequence of complete evidence frames produced by a feature-owned model. A frame must make the relevant state and causal focus inspectable.

**Minimal conceptual API**

```ts
type TraceFrame<Frame> = {
  index: number;
  state: Frame;
  focus?: readonly string[];
};

type ImmutableTrace<Frame> = {
  frames: readonly TraceFrame<Frame>[];
  terminal?: "completed" | "blocked" | "failed";
};
```

A future extraction may add a feature-neutral selected index contract, but should not add playback, rewind, timers, rendering slots, or domain-specific status strings.

**Trace-selection subcandidate**

If a second consumer confirms it, the only plausible UI-adjacent piece is a controlled selection contract such as:

```ts
type TraceSelection = {
  selectedIndex: number;
  select(index: number): void;
};
```

Its responsibility would be bounded index normalization, stable current-frame identity, and keyboard/announcement conventions for a linear trace. It would not generate frames, decide whether previous/next is legal, autoplay, rewind a model, render a frame, or interpret `focus` labels. Program execution, sorting, protocol, and query-plan traces could consume it if they all expose a linear frame list and the same keyboard behavior. Image's static representation, Audio's continuous cursor, and a branching debugger should not. The extraction gate is one unchanged selection test used by two real traces; the deletion condition is any need for graph navigation, time scrubbing, or semantic selection callbacks.

**State/invariant contract**

- frame order is stable and deterministic;
- frame `i+1` is explainable from frame `i` and the feature's transition rule;
- history is immutable once generated;
- selection never mutates the trace;
- a trace is an evidence projection, not the simulator that generated it.

**Materially different consumers**

1. **Program execution:** statement/iteration frames with environment, branch result, output, and termination.
2. **Sorting/search:** comparison/swap or probe frames with array/indices/invariant.
3. **Protocol reliability:** message send/receive/timeout/retry frames with packet state and causal reason.
4. **Current Home Network:** immutable probe event history is an existing partial consumer.
5. **Formula/query evaluation:** expression-substitution or query-plan frames, if each frame is complete enough to explain the next result.

These consumers are compatible only at the ordered evidence level. They do not share execution rules, frame types, rendering, or pedagogy.

**Counterexamples**

Do not use it for:

- Audio playback samples or continuous cursor movement;
- Image's static sampled representation, where “next frame” is not causal execution;
- arbitrary event logs that omit state and cannot explain why the next event occurred;
- branching traces that need a tree/graph rather than one ordered sequence;
- traces whose frames are generated nondeterministically without a seed/version contract.

**Ownership/location**

Initially feature-local `domain` or `lesson` trace types. If the same immutable frame schema survives two future courses, consider a tiny `src/shared/learning/trace.ts` or a plain package-local type; do not place a React component beside it.

**Testing strategy**

- deterministic generation from the same initial state;
- frame-to-frame transition oracle;
- terminal/blocked behavior;
- immutability after later feature edits;
- selection does not mutate frames;
- UI tests verify selected frame text and keyboard navigation.

**Accessibility implications**

A trace must have a linear keyboard path, a labeled current frame, a text/table representation, and an explanation of focus. Do not make an animated timeline the only access path.

**Extraction trigger**

Extract only after two independently designed current courses (for example Program Execution and Protocol Reliability) use the same immutable trace data contract and one unchanged trace test can run against both. The second course must be built feature-locally first.

**Deletion/falsification condition**

Delete the candidate if either consumer needs callbacks for frame construction, consumer-specific rewind/branch semantics, a shared scheduler, or more adapter code than local trace generation. Also delete it if students learn more from a domain-specific representation than from linear frames.

**Expected future effect**

If it survives, course authors can expose causal intermediate state and deterministic history without inheriting a playback framework. The expected saving is in evidence/test conventions, not JSX volume.

---

### 6.2 Versioned deterministic random stream

**Classification:** C — domain/simulation primitive.

**Exact responsibility**

Provide a pure, documented pseudo-random stream with explicit seed and algorithm/version so a stochastic experiment can be replayed and tested.

**Minimal conceptual API**

```ts
type RandomStream = {
  seed: number | string;
  algorithmVersion: string;
  next(): { value: number; stream: RandomStream };
};
```

A production API would likely use an immutable state object or a generator-specific typed result. It must not wrap `Math.random()` or hide global mutable state.

**State/invariant contract**

- same seed + algorithm version + number of draws gives the same sequence;
- advancing the stream is explicit and testable;
- changing the experiment seed is distinguishable from changing the domain parameters;
- the stream is not cryptographic randomness and must say so;
- consumers own how draws affect their model.

**Materially different consumers**

1. Monte Carlo estimation of π or an area/integration problem.
2. Randomized algorithm comparison or randomized pivot selection.
3. Sensor/control experiments with disclosed noise distributions.
4. Dataset sampling or train/test split in a small AI/data experiment.

These are compatible because reproducibility is the same mathematical contract while the observed domain state remains local.

**Counterexamples**

Do not use it for passwords, cryptography, security claims, or any course where students could mistake deterministic educational randomness for secure entropy. Do not expose a generic random stream if the lesson needs a domain-specific distribution or correlated noise process.

**Ownership/location**

Initially the relevant feature's `domain/` folder. A shared pure module becomes defensible only after two courses require the exact algorithm/version contract and agree on the observable sequence.

**Testing strategy**

Known-vector tests, replay tests, seed separation, long-run bounds/distribution smoke tests, and model-level tests that prove the seed affects only intended stochastic choices.

**Accessibility implications**

A learner must be able to see or share the seed and understand when a result is stochastic. Screen-reader evidence should not depend on watching random points animate.

**Extraction trigger**

Two independent current courses must use the same stream contract, need reproducible URLs or test fixtures, and document the same non-cryptographic limitation.

**Deletion/falsification condition**

Delete if every course chooses a different distribution/algorithm, if browser/library differences make replay unreliable, or if exposing the seed distracts from the concept rather than supporting it.

**Expected future effect**

Makes stochastic evidence inspectable, replayable, and testable. It does not reduce UI code and should never become a simulation framework.

---

### 6.3 Pure discrete-step result

**Classification:** C/B — possible model-level contract; not a controller.

**Exact responsibility**

Describe one explicit deterministic transition of a feature-owned model and the evidence produced by that transition.

**Minimal conceptual API**

```ts
type DiscreteStepResult<State, Evidence> = {
  nextState: State;
  evidence: Evidence;
  done: boolean;
};

type DiscreteStep<State, Evidence> = (state: State) => DiscreteStepResult<State, Evidence>;
```

This is a type-level sketch, not a recommendation to add a generic function to `shared` today.

**State/invariant contract**

- one call means one pedagogically meaningful transition;
- no hidden wall-clock time, animation, scheduler, or side effect;
- `nextState` satisfies the feature's domain invariant;
- evidence corresponds to the transition just taken;
- termination is explicit and feature-owned.

**Materially different consumers**

1. Loop/variable execution: one iteration or statement.
2. Protocol forwarding/retry: one message or timeout transition.
3. Clocked control: one fixed simulation tick, if the model is discretized.
4. Logic circuit/state machine: one input/propagation transition.

**Counterexamples**

Do not use it for Audio playback, continuous chart sampling, arbitrary async browser effects, a sorting algorithm with multiple simultaneous mutations unless one step is pedagogically defined, or a generic event loop with consumer-provided scheduler callbacks.

**Ownership/location**

Feature domain/lesson. A shared type is considered only after two current consumers have exactly the same step semantics and no adapter changes the meaning of “one step.”

**Testing strategy**

Golden transition tests, invariant checks after every step, termination/progress checks, deterministic replay, and explicit tests for invalid/no-op transitions.

**Accessibility implications**

Each step must have a text explanation and a stable focus target; automatic playback is optional and cannot be the only interaction.

**Extraction trigger**

Program Execution plus a genuinely different course (Protocol Reliability or Sensor Control) must use the same pure result contract without adding scheduler, branch, or clock flags.

**Deletion/falsification condition**

Delete if the second consumer needs a different granularity, rewind model, event queue, or hidden time. If the API grows `tick`, `play`, `pause`, `rewind`, `speed`, `onEvent`, and `strategy`, it has become a mini-framework and failed.

**Expected future effect**

Potentially reduces the cost of making execution traces correct and testable. It must not be sold as a universal stepper.

---

### 6.4 Prediction → intervention → observation → evidence

**Classification:** B — lesson contract, not a UI component.

**Exact responsibility**

Make a learner's prediction an explicit, optional input when it changes the investigation, then preserve the intervention and observed evidence so the learner can reconcile the prediction with the model.

**Minimal conceptual API**

The minimum useful record is conceptual:

```ts
type InquiryRecord<Prediction, Intervention, Observation, Evidence> = {
  prediction?: Prediction;
  intervention: Intervention;
  observation: Observation;
  evidence: Evidence;
};
```

A shared runtime should not own when prediction is required, when the answer is revealed, or how it is scored.

**State/invariant contract**

- prediction is distinguishable from observation;
- observation is generated by the same model as the displayed evidence;
- intervention is explicit enough to reproduce the observation;
- the learner can inspect disagreement without being forced through a quiz workflow.

**Materially different consumers**

1. Network: predict local/remote or the first failing hop, edit an address, send a probe, inspect causal events.
2. Encoding: predict which parameter causes spatial/color/aliasing loss, change it, inspect representation and error.
3. Control: predict whether a threshold/controller will overshoot, perturb the input, observe state and safety evidence.
4. AI/data: predict a classifier outcome or subgroup metric, alter threshold/data, inspect per-example and aggregate evidence.

They are compatible pedagogically, not necessarily as state or UI.

**Counterexamples**

Do not use it for a mandatory “submit answer” gate, a multiple-choice quiz, a decorative prediction field, or any lesson where the prediction does not alter what evidence the learner examines.

**Ownership/location**

Feature lesson state and course design documents. If a shared representation ever emerges, it belongs in a learning/evidence module, not `src/shared/lab` UI.

**Testing strategy**

Test that prediction is stored separately, intervention produces deterministic observation, evidence uses model output, and optional prediction does not block exploration. Test URL/reset semantics locally.

**Accessibility implications**

Prediction input needs a clear label, but the learner must also be able to navigate to the resulting evidence and hear the reconciliation in text. Avoid time-limited reveal or color-only correctness.

**Extraction trigger**

Three independent courses must use prediction to guide observation, with different domain answers and no shared submit/retry/status semantics. Before then, record the pattern in course designs only.

**Deletion/falsification condition**

Delete as a primitive if predictions consistently become optional decorations, grading gates, or generic answer validation that does not improve causal reasoning.

**Expected future effect**

Could provide a reusable lesson-design quality gate and eventually a small evidence record. It should not reduce page JSX by itself.

---

## 7. Adversarial prototypes and type-level findings

### 7.1 The narrow trace sketch survives; the Stepper does not

A feature-local program trace can be represented as:

```ts
type LoopFrame = {
  iteration: number;
  variables: Readonly<Record<string, number>>;
  condition: boolean;
  focus: "condition" | "body" | "update" | "result";
};

const trace: ImmutableTrace<LoopFrame> = {
  frames: [...],
  terminal: "completed",
};
```

A sorting course could use `SortFrame`; a protocol course could use `PacketFrame`. The only plausible shared part is ordered immutable frames plus selection. The following API fails quickly:

```ts
type StepperProps<Frame> = {
  frames: Frame[];
  onStep: (direction: "next" | "previous") => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  renderFrame: (frame: Frame) => ReactNode;
  renderStatus: (frame: Frame) => ReactNode;
  canAdvance: (frame: Frame) => boolean;
  clock?: Clock;
  mode?: "linear" | "branching" | "continuous";
};
```

This is callback soup. It owns no invariant and forces every consumer to explain its semantics through callbacks. The correct response is to keep trace generation and controls local until two real courses prove a narrower data contract.

### 7.2 Representation chains are a useful design lens, not a proven abstraction

The tempting abstraction is:

```ts
type Stage<T> = { id: string; value: T };
type RepresentationChain = readonly Stage<unknown>[];
```

It compiles for:

- character → code point → UTF-8 bytes → decoded character;
- raster → samples → palette indices → reconstruction;
- signal → samples → quantized codes → playback;
- payload → protocol headers → transmitted message.

But it says nothing about the relation between stages, loss, cardinality, coordinate mapping, validity, or reconstruction. Adding `map`, `loss`, `inverse`, `inspect`, `error`, and `provenance` fields creates a mini-framework whose consumers must understand internal assumptions. The chain should remain a **course-design vocabulary** and be tested in each domain until two consumers expose the same typed relation.

### 7.3 `validate → issues[]` is not a universal evidence contract

Network validation has invalid IP, invalid prefix, reserved network/broadcast address, duplicate address, and first-failure behavior. A database course may have nullability, type coercion, uniqueness, foreign keys, and query cardinality. Malformed UTF-8 has byte-level decoding errors and replacement policy. Control has safety violations and unstable behavior. A generic `Issue` object would either flatten pedagogical distinctions or accept course callbacks for severity, recovery, first failure, and explanation. Keep validation domain-local.

### 7.4 A “generic inspector” is a rendering hole

Image inspection is coordinate-to-sample-to-palette-to-bits. Network inspection is selected device/packet/event/history snapshot. Audio inspection is time/sample/reconstruction readout. Two's Complement inspection is not a selected object at all; its important evidence is the whole ripple trace and two interpretations. A shared inspector would be a set of slots, not a primitive.

### 7.5 Deterministic simulation is not a shared clock

Audio's `tick` is a playback cursor operation with loop wrapping and browser audio lifecycle. A protocol simulator needs timers, loss, retries, and possibly an event queue. A control course needs fixed-step integration, delay, saturation, and safety. A Monte Carlo course needs batches and seeded draws. A global `Clock`, `play`, or `advance` API would make tests and teaching semantics less precise, not more.

---

## 8. Primitive dependency/composition graph

The long-term architecture should be orthogonal. The following graph is a dependency hypothesis, not a framework to build now:

```text
                    app shell / route transport
                     (opaque, orthogonal)
                              │
                              ▼
                    feature-owned initial scenario
                              │
                              ▼
                    feature domain model + invariants
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
  feature-owned lesson transitions       derived evidence projection
             │                                 │
             │                    ┌───────────┴───────────┐
             │                    ▼                       ▼
             │          optional immutable trace      local inspection /
             │          (ordered evidence data)       selection state
             │                    │                       │
             │                    └───────────┬───────────┘
             │                                ▼
             │                    feature-owned representation
             │                    (grid/table/SVG/canvas/text)
             │                                │
             └────────────────────────────────▼
                         accessible, testable evidence

optional domain branches:

  explicit seed → deterministic random stream → domain model / trace
  pure discrete step → domain model / trace
  prediction + intervention → observation/evidence record
```

Important composition rules:

- **Model → trace** is optional. Image and Two's Complement do not need a trace just because they have intermediate representations.
- **Trace → selection/inspection** is optional. A trace can be rendered as a table, narrative, or domain diagram; selection is local until its interaction contract repeats.
- **Representation** is not owned by the trace. A trace frame may contain a representation, but a representation can exist without time/order.
- **Seed** feeds a domain model; it does not belong to the trace controller.
- **Inquiry records** wrap a learner's reasoning around a model; they do not control model transitions.
- The app shell and URL transport sit outside all lesson/domain composition.

This is intentionally not:

```text
LessonRuntime → ExperimentEngine → VisualizationFramework → every course
```

---

## 9. Explicitly rejected abstractions

### Generic `LessonRuntime` / `ExperimentEngine`

Rejected because the four current courses have no common phase, submit, status, clock, reset, action union, scenario schema, or layout. A runtime would either be a weak wrapper around `useReducer` or accumulate course-specific flags and callbacks. It would make course 5 conform to the first four rather than reveal the next invariant.

### Universal `Stepper` / playback framework

Rejected because “step” means iteration, audio time, causal event, expression substitution, batch, or nothing. The strongest surviving idea is immutable trace data, not controls.

### `ParameterPanel` / `ParameterControl` as learning primitives

Reusable sliders/selects/text inputs are design-system controls. Range labels, coupling, units, reset, URL ownership, and evidence semantics are feature-local. Promoting them to learning primitives would confuse low JSX duplication with invariant ownership.

### `BitGrid` / `BinaryNumber`

Rejected by the Two's Complement fourth-course test. Image's cells represent 2D spatial samples; Two's Complement's cells are directional fixed-width operands with signed weights and carry. Text bytes, gates, and pixels add more counterexamples. A low-level grid renderer may be A-only UI code, never a domain/learning primitive without a stronger invariant.

### `ScenarioCodec`

Rejected because current parsers differ in defaults, legacy aliases, clamping, canonical phase, duration-dependent loop validity, preset expansion, and transient state. The proven reusable contract is opaque transport, not shared interpretation.

### Generic `Validator`, `Issue`, or `ViolationPanel`

Rejected because invalid input, mathematical overflow, protocol failure, and safety violations are different pedagogical facts. A common issue list hides what the learner needs to understand.

### Generic `Comparator` / before-after diff

Rejected because image error, audio reconstruction error, repaired packet path, signed overflow, classifier threshold change, and query result differences require different metrics and explanations. “Difference” is not a domain-neutral invariant.

### Generic formula evaluator or query/runtime DSL

Rejected because it becomes a language implementation with parsing, safety, evaluation order, error propagation, and domain-specific intermediate evidence. Feature-local restricted evaluators may be justified by one course; two real compatible consumers are required before any extraction.

### Shared event bus, clock, or simulation scheduler

Rejected because it couples feature lifecycles, makes deterministic testing harder, and creates semantic leakage between browser playback, protocol timing, control integration, and algorithm stepping.

### `VisualizationFramework` / chart family

Rejected as a B primitive. A low-level SVG/canvas/chart mark may be a design-system utility, but axes, scales, point meanings, interaction, and accessible evidence belong to the feature.

### Configuration-driven DSL or builder framework

Rejected because arbitrary callbacks, render props, strategy objects, flags, and course branches are evidence that the abstraction is false. A DSL would optimize future code volume at the cost of course-author cognition and pedagogy.

---

## 10. Extraction gates

| Candidate                      | Gate before production extraction                                                                                                                       | Falsification/deletion                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Immutable trace                | Two independently built current courses produce ordered deterministic frames; same frame/selection tests run unchanged; no renderer/scheduler callbacks | Frames are partial, branching, nondeterministic, or need course-specific rewind/play semantics                     |
| Trace cursor                   | Two traces share controlled index/ID selection, keyboard behavior, and focus semantics; selected-frame contract remains neutral                         | One course needs graph navigation, continuous scrub, or semantic selection that makes the common cursor misleading |
| Seeded random stream           | Two domains use same algorithm/version, seed/replay behavior, and test vectors; non-cryptographic disclosure is accepted                                | Distribution/algorithm differs, replay is not stable, or seed distracts from learning                              |
| Pure discrete step             | Program Execution plus Protocol or Control use one explicit transition with same “one step” meaning; no scheduler flags                                 | Granularity, event queue, time model, or termination semantics differ                                              |
| Inquiry cycle                  | Three courses use prediction to choose/interpret an intervention, not merely to grade; record remains optional                                          | Prediction is decorative, mandatory quiz state, or not connected to evidence                                       |
| Representation path            | Three encoding/data-flow courses expose the same typed stage relation, mapping/provenance, and loss semantics without adapters                          | Generic stage list needs `unknown`, callbacks, per-domain relation objects, or hides loss/inversion rules          |
| Editable finite representation | At least two future courses share value/position mutation and interpretation rules, not just a grid appearance                                          | Dimension, mutation, or evidence semantics differ as Image vs Two's Complement already do                          |
| Table/derived-cell contract    | Query, truth-table, and data-quality courses share cell lineage/selection/editing semantics and tests                                                   | Table is merely a visual container or derivation rules differ                                                      |
| Graph/node-edge model          | Routing, circuits, and dependency/control courses share graph mutation/path invariants                                                                  | Graphs require incompatible direction, scheduling, or path explanations                                            |
| Deterministic clock            | Two current courses need the same explicit event-time semantics and replay tests                                                                        | API grows wall-clock, playback, async, scheduler, or browser lifecycle concerns                                    |
| Violation/evidence schema      | Three courses share severity, first-failure, recovery, and accessible explanation semantics                                                             | `Issue` grows adapters for network, data, encoding, and safety meanings                                            |

A gate must be evaluated after feature-local implementation, not before. The second consumer is evidence only if it could have been built without knowing the first consumer's internal vocabulary.

---

## 11. Recommended high-information reference-course sequence

Each course below is both a learner-facing experiment and an architectural experiment. None should import a proposed shared learning primitive on its first implementation.

### Course 5 — Program execution and loop/variable tracing

**Core lesson:** execute a small deterministic program with assignment, condition, loop, and accumulator; expose variables, branch result, output, and termination.

**Hypotheses tested**

- immutable inspectable trace;
- pure discrete-step result;
- prediction before execution;
- invariant/range evidence;
- keyboard-accessible trace navigation;
- whether “execution trace” is compatible with Network's causal events.

**Existing assumptions attacked**

- that static representation views are enough;
- that a generic `Stepper` can own state progression;
- that a course can expose execution as animation;
- that variable tables and formulas are a common primitive.

**Outcome strengthening extraction**

A feature-local trace, with complete deterministic frames, can be used for loop execution and later reused unchanged by a materially different course. A test can assert frame-to-frame transitions and accessibility without knowing a renderer.

**Outcome killing extraction**

If the pedagogically correct unit is a language-specific statement with scope/call-stack/exception semantics, or if students need branch trees, breakpoints, and debugger-specific controls, the generic linear trace should be shrunk or rejected.

**Why higher information value than obvious alternatives**

Sorting is a tempting but narrower algorithm trace and could accidentally validate a stepper because its animation looks similar. Program execution tests actual runtime state, control-flow semantics, prediction, termination, and author cost.

---

### Course 6 — Text, character encoding, and UTF-8 failure

**Core lesson:** inspect a character/code point/byte sequence, decode valid and malformed sequences, and explain how one byte can change the result.

**Hypotheses tested**

- representation transformation path;
- editable finite representation without `BitGrid` semantics;
- source → encoded → decoded mapping;
- coordinate/byte inspection;
- reversible versus lossy transformation evidence;
- accessible byte-level representation.

**Existing assumptions attacked**

- that Image and Two's Complement justify one cell-grid primitive;
- that every representation chain can share a stage renderer;
- that a generic validator can explain malformed data;
- that URL scenario fields have common encoding semantics.

**Outcome strengthening extraction**

If text and a later media/data course share a typed stage relation and byte-boundary inspection with no domain callbacks, a narrow representation/evidence schema may be justified.

**Outcome killing extraction**

If code points, bytes, normalization, and replacement policy require domain-specific explanations and no common stage relation remains, keep all representation pipelines feature-local.

**Why higher information value than a generic binary/hex calculator**

It is a real transformation with decoding failure and reversible mapping, rather than another positional-number screen. It directly attacks the strongest “representation chain” hypothesis.

---

### Course 7 — Monte Carlo π and reproducible randomness

**Core lesson:** generate points with a disclosed seed, expose individual hit/miss evidence, compare batch sizes, and inspect convergence without implying a deterministic exact answer.

**Hypotheses tested**

- versioned seeded random stream;
- deterministic replay;
- batch versus single-step evidence;
- parameter sweep and comparison;
- whether a discrete trace and a stochastic process share a controller.

**Existing assumptions attacked**

- a universal stepper/playback model;
- generic charts as learning primitives;
- “random” experiments without reproducibility;
- prediction gates that turn a simulation into a quiz.

**Outcome strengthening extraction**

Two independently built stochastic lessons use the same seed/version/stream contract and can replay their model tests; UI remains feature-local.

**Outcome killing extraction**

If batch sampling, confidence/convergence, and seeded point generation need incompatible random/disclosure semantics, do not abstract beyond feature-local deterministic fixtures.

**Why higher information value than a simple slider demo**

It forces the architecture to distinguish deterministic replay, stochastic evidence, aggregation, and visual convergence. It is the first strong test of a domain primitive not visible in the current four courses.

---

### Course 8 — Relational data, query, and constraints

**Core lesson:** define a small schema, enter or repair records, run filters/joins/aggregation, and inspect which source rows produced each result and which constraints rejected data.

**Hypotheses tested**

- table with derived/selected cells;
- lineage/provenance;
- validation/invariant evidence;
- formula/query intermediate trace;
- whether a generic builder or data table is real.

**Existing assumptions attacked**

- the historical `DataTable` candidate;
- generic `Validator` and `Issue` renderers;
- formula-evaluator extraction;
- table appearance as a reusable learning primitive.

**Outcome strengthening extraction**

Query and a later data-quality/AI course share a stable source-to-derived lineage and accessible cell selection without callbacks that encode relational semantics.

**Outcome killing extraction**

If joins, nulls, constraints, and aggregation require different evidence models, keep table rendering and validation feature-local. A design-system table may still be reused for appearance/accessibility.

**Why higher information value than sorting**

Sorting mostly tests algorithm traces. A relational course tests data modeling, provenance, derived cells, invalidity, and domain-specific explanations that are likely to expose semantic leakage.

---

### Course 9 — Protocol process: DNS/HTTP or reliable message exchange

**Core lesson:** follow a request through messages, headers, cache or retry behavior, and a controlled fault such as loss, delay, or malformed response.

**Hypotheses tested**

- immutable causal trace across a different domain than Home Network;
- pure discrete-step result;
- deterministic simulated time;
- fault injection and before/after comparison;
- packet/message representation path.

**Existing assumptions attacked**

- Network's event trace being mistaken for a universal trace;
- a shared clock/event bus;
- generic status/issue semantics;
- topology/graph abstractions.

**Outcome strengthening extraction**

Protocol and program traces share immutable frame/selection tests while timing, domain state, and rendering remain local. A narrow trace data contract becomes defensible.

**Outcome killing extraction**

If retries, timers, and message ordering require an event queue or branching history that program execution cannot share, keep simulation and trace generation feature-local.

**Why higher information value than another subnetting course**

The current Home Network already covers synchronous addressing/probe diagnosis. Protocol reliability adds time, loss, retries, ordering, and causal message state—the dimensions needed to falsify a simplistic trace or clock.

---

### Course 10 — Sensor feedback and control

**Core lesson:** read a noisy sensor, apply a threshold/controller, observe actuator output and error over a disclosed deterministic clock, then perturb the input or delay.

**Hypotheses tested**

- deterministic discrete simulation versus continuous time;
- seeded noise;
- intervention/perturbation;
- parameter sweep and comparison;
- safety/range violation evidence;
- whether “simulation controller” is a real domain primitive.

**Existing assumptions attacked**

- Audio's playback clock as a general clock;
- generic parameter panels;
- generic before/after comparison;
- universal issue/violation status;
- pipeline abstractions.

**Outcome strengthening extraction**

Control and protocol/algorithm courses share only a very narrow deterministic stepping/seed contract, while each owns its plant, safety, and evidence. This would justify pure domain utilities, not a runtime.

**Outcome killing extraction**

If delay, continuous integration, noise, and safety semantics are irreducibly feature-specific, keep a local simulator and record the reusable lesson pattern only.

**Why higher information value than a dashboard or classifier**

A dashboard can be mostly a table/chart; a control lesson forces closed-loop causality, time, perturbation, and safety. It is the strongest stress test of simulation primitives.

---

## 12. What should deliberately not be abstracted yet

Do not abstract the following until the gates above pass with real consumers:

- lesson phases, `ready/editing/success/failure`, submit/retry/next-step;
- a global action union or reducer shape;
- a shared clock, playback, event bus, scheduler, or simulation engine;
- URL parsing/serialization/clamping/defaults;
- formulas, validators, issue taxonomies, overflow/status labels;
- image/audio/network/arithmetic domain types;
- a generic `BitGrid`, `DataTable`, `Inspector`, `Comparator`, or `VisualizationPanel` as learning primitives;
- a universal trace renderer or autoplay stepper;
- a configuration-driven lesson DSL;
- a generic builder with render props/strategy callbacks;
- upload, WebAudio, canvas, SVG, or browser lifecycle wrappers unless the exact browser invariant repeats;
- assessment/grading contracts before the learning evidence has stabilized;
- a package split or workspace package merely to make a future abstraction look official.

Selective A-layer design-system reuse remains appropriate for controls, focus rings, tokens, typography, and low-level table/SVG/canvas mechanics when they are truly appearance/accessibility concerns. That reuse must not own lesson semantics.

---

## 13. Single next engineering task

Implement **Course 5: Program Execution and Loop/Variable Tracing** as a completely feature-local reference course, with these constraints:

1. keep `domain → lesson → ui` ownership;
2. implement a small deterministic program model and explicit state transitions;
3. expose a complete immutable execution trace and accessible variable/branch evidence;
4. make prediction optional and non-blocking unless the course proves it improves learning;
5. test model invariants, frame-to-frame transitions, reset-to-URL behavior, keyboard trace navigation, and direct URL hydration;
6. do not create or import `Trace`, `Stepper`, `LessonRuntime`, `ParameterPanel`, `ScenarioCodec`, `Validator`, or any other shared lesson primitive;
7. add a short research note recording which candidate contracts survived and which were falsified.

At the end of that course, perform the extraction review again. The goal is not to extract a trace component. The goal is to obtain a second real consumer and learn whether an immutable trace **data contract** exists at all.

---

## Final decision

Computing-lab should grow by building **heterogeneous feature-local experiments** and extracting only narrow, proven contracts after the second or third genuinely compatible consumer. The current long-term foundation is:

```text
app shell + opaque scenario transport
                 │
                 ▼
feature-owned model and transitions
                 │
                 ▼
feature-owned inspectable evidence
                 │
      optional future trace / seed / step contracts
```

The repository has already demonstrated that this discipline is more valuable than a large component catalog. The correct architecture may ultimately contain only a few domain-neutral data contracts and a small design system. That is not an incomplete framework. It is the result the evidence currently supports.
