# Copy and accessibility ledger

This ledger is intentionally separate from the behavior ledger. All ten routes may receive copy/accessibility cleanup; only Protocol, Audio, and Relational receive pedagogical/behavior changes in this pass.

## Global surfaces

| Surface                         | Scope                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `index.html`                    | `lang="zh-CN"`, title, meta description; no code identifiers changed.     |
| `HomePage`                      | Chinese eyebrow, registry label, local-compute note, lab descriptions.    |
| `LabShell`                      | Chinese brand/context labels, local workspace note, nav accessible names. |
| `LabErrorPage` / `NotFoundPage` | Chinese error and recovery copy.                                          |
| Shared CSS                      | Chinese wrapping, no semantic/runtime changes.                            |

## Route ledger

| Route                     | Copy/accessibility cleanup                             | Behavior change |
| ------------------------- | ------------------------------------------------------ | --------------- |
| `/labs/image-encoding`    | Yes: source/evidence/payload labels, ARIA names        | No              |
| `/labs/audio-encoding`    | Yes: sampling/quantization/aliasing labels, ARIA names | Yes             |
| `/labs/home-network`      | Yes: probe/config/status labels                        | No              |
| `/labs/twos-complement`   | Yes: reading/carry/overflow/table labels               | No              |
| `/labs/program-execution` | Yes: fixture/frame/final-state labels                  | No              |
| `/labs/protocol-process`  | Yes: state/knowledge/queue labels, ARIA names          | Yes             |
| `/labs/utf8`              | Yes: branch/byte/evidence labels                       | No              |
| `/labs/monte-carlo`       | Yes: fixture/batch/estimate labels                     | No              |
| `/labs/relational-data`   | Yes: query/source/NULL/join labels, ARIA names         | Yes             |
| `/labs/byte-edit`         | Yes: preset/edit/validity labels                       | No              |

Allowed technical terms retained when curriculum-relevant: `UTF-8`, `Unicode`, `NULL`, `ACK`, `while`, and first-use English in parentheses after Chinese. Routes, IDs, TypeScript names, domain IDs, and test-only technical names stay English.
