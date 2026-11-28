# Productization selection gate

## Gate rules

A behavior change enters this pass only when:

1. two or more restricted personas report the same issue;
2. the issue is visible in the rendered product;
3. it is not only a drag/click automation artifact;
4. existing causal evidence is useful but hidden by language or flow;
5. a feature-local fix is enough;
6. no domain rewrite or universal lesson runtime is needed.

## Decisions

| Lab               | Decision   | Reason                                                                                                           |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Protocol Process  | Behavioral | State-versus-knowledge and ACK vocabulary repeated across roles; trace already supports fix.                     |
| Audio Encoding    | Behavioral | Sampling/quantization and aliasing language fails knowledge-denied and careful readers; model evidence exists.   |
| Relational Data   | Behavioral | Pre-interaction answer leakage plus provenance/NULL/FK abstraction; source evidence can be re-sequenced locally. |
| Program Execution | Copy-only  | Trace mechanism is comparatively clear; remove English and clarify current versus final state.                   |
| Two’s Complement  | Copy-only  | Evidence is strong enough; translate primary reading/carry/overflow and reduce table language.                   |
| Image Encoding    | Copy-only  | Visual causal evidence is useful; localize and verify controls later.                                            |
| Home Network      | Copy-only  | Core route model may need domain decisions beyond this bounded pass.                                             |
| UTF-8             | Copy-only  | Branch evidence is already concrete; localize wording.                                                           |
| Monte Carlo       | Copy-only  | Keep honest metrics; translate labels without new flow.                                                          |
| Byte Edit         | Copy-only  | Preserve strict validator; localize edit/validity language.                                                      |

Behavior changes: 3 labs. This is within the requested 3–5 limit.
