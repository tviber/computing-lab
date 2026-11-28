# Answer-leakage regression gate

## Baseline leakage observed

| Route                     | Pre-interaction answer-bearing copy                                                                                                                                | Product requirement                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/labs/image-encoding`    | Intro names spatial sampling and quantization; payload explanation is visible.                                                                                     | Keep a short hook, but move detailed causal explanation to evidence/result context.                                                                                                                                                        |
| `/labs/audio-encoding`    | “Every exposed component is below or exactly at the current Nyquist limit.”                                                                                        | Keep status truthful, but make it a result after a meaningful configuration; explain the term in Chinese.                                                                                                                                  |
| `/labs/protocol-process`  | “A timeout alone does not prove receiver failure”; receiver duplicate behavior stated before Step.                                                                 | Replace with a question before exploration; show conclusion in selected evidence/result.                                                                                                                                                   |
| `/labs/relational-data`   | NULL/empty/FK behavior explained before first query.                                                                                                               | Move explanation beside the relevant rows/query evidence.                                                                                                                                                                                  |
| `/labs/program-execution` | Intro states final false condition skips the loop body.                                                                                                            | Keep operational goal, defer the mechanism explanation until trace evidence.                                                                                                                                                               |
| `/labs/twos-complement`   | The stored result `1000` can be shown as a deliberate cognitive-conflict hook, but a heading that asks why it “becomes 1000” treats the target answer as a reveal. | Keep the stored bit pattern visible as evidence; use a neutral prompt (`0111 + 0001` 的结果应该怎样读？). The intended task is to explain the known stored result under signed/unsigned readings and signed overflow, not to guess `1000`. |

## Regression assertions

After implementation, first-render DOM checks must assert:

- Chinese question/hook exists before Step/Run;
- no conclusion-bearing English sentence appears in the pre-interaction region for Protocol or Relational;
- technical identifiers/fixture data remain present where needed;
- answer-bearing explanation appears only in evidence/result regions after the relevant event/query/operation;
- prediction controls do not reveal the expected answer in labels, help text, or hidden accessible names;
- Two's Complement may expose the observed stored bits as an intentional hook only when the prompt asks for interpretation rather than prediction; the research score must treat explanation of that known result as the target;
- `html[lang="zh-CN"]` is present.

These are product-copy checks, not claims that a real human learned the objective.
