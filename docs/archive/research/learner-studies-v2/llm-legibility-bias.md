# LLM-to-LLM legibility bias

The previous study treated fluent model explanations as evidence of learner comprehension. This v2 pass treats that as a threat.

## What the model can do that a student may not

- Expand `provenance`, `Nyquist`, `primary reading`, `ACK`, and `carry-out` from training data.
- Infer omitted causal steps from a compact table or a familiar visual pattern.
- Read the entire DOM and treat every label as equally attended.
- Revisit the page after receiving a transfer question and search for a matching number.
- Treat a clean final answer as evidence of a stable mental model.

## Direct evidence from the rendered baseline

- Protocol says in English, before interaction, “A timeout alone does not prove receiver failure.” The knowledge-denied learner therefore cannot be used to prove that the page independently taught this distinction.
- Relational Data states before interaction that `NULL` differs from an empty string and that the broken loan disappears from the joined aggregate. This is objective leakage, not post-learning evidence.
- Program’s Chinese introduction states that the final false condition skips the loop body before the learner steps. This is also leakage.
- Audio shows “folds to 4000 Hz” but does not establish the causal meaning of “folded frequency” in Chinese. A model may fill that gap from prior knowledge.
- Two’s Complement shows the target `0111 + 0001 → 1000` and English `Primary reading`, `carry-out`, and `signed overflow` labels. A technically trained model can decode them; a low-prior student may not.

## Interpretation rule

Correctness is not enough. A learner must identify the evidence actually seen, explain the mechanism in their own words, and solve a structurally new task without reopening the page. Unsupported but correct explanations are marked contaminated or unjustified.
