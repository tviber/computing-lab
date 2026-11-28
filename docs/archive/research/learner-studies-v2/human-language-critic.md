# Independent human-language critic

Date: 2026-08-19. Role boundary: critique learner-facing language only; do not solve the computer-science tasks. Verdict: no P0, but P1 copy/sequence issues in Protocol, Audio, and Relational; P1/P2 terminology issues in Program and Two's Complement; P2 shell cleanup.

## Highest-priority findings

| Surface          | Severity | Exact issue                                                                                                                  | Natural rewrite / action                                                                                                                 |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol         | P1       | `At timeout, the sender knows` is a sentence fragment with an unexplained English subject.                                   | `超时发生时，发送方能确定什么？`                                                                                                         |
| Protocol         | P1       | `A timeout alone does not prove receiver failure.` gives the core answer before exploration.                                 | Defer; use `超时后，请检查记录：发送方此刻掌握了哪些信息？`                                                                              |
| Protocol         | P1       | `Receiver accepts once, then suppresses the retry duplicate.` reveals the result and stacks three unexplained terms.         | In result state: `接收方已处理 1 次；后续重复消息没有再次触发处理。`                                                                     |
| Audio            | P1       | `REFERENCE IMPLEMENTATION`, `Nyquist`, `Folded frequency`, `Payload` read like an engineering dashboard.                     | `参考模型`; `奈奎斯特上限（Nyquist limit）`; `混叠后的频率`; `理论数据量`.                                                               |
| Audio            | P1       | One sentence combines deterministic fixture, explicit stepping, and playback buffer.                                         | Split: `页面上的数值来自固定的本地示例。图表按你点击的每一步推进；试听播放始终使用固定的 48 kHz 设置。`                                  |
| Relational       | P1       | `provenance` and `derived cells` are internal abstractions without a learner-facing subject.                                 | `来源记录（provenance）`; `计算得到的结果`.                                                                                              |
| Relational       | P1       | `NULL means absent value...` and broken-loan explanation leak the core answer before queries.                                | Defer to result evidence; ask `比较 NULL 和空字符串：它们在结果中有什么不同？`                                                           |
| Program          | P1/P2    | `After the selected frame`, `IMMUTABLE LOCAL TRACE`, and `pure transition` make frame/state semantics abstract.              | `选中步骤之后的状态`; `固定的执行记录（只能查看）`; `“执行一步”和“运行到结束”使用同一套执行规则。选择某一步只会查看记录，不会改变程序。` |
| Two's Complement | P1/P2    | `Primary reading`, `ripple-carry`, `CARRY IN/OUT`, and `SIGNED/UNSIGNED EVIDENCE` stack terms before the learner needs them. | `当前按哪种数来读`; `逐列传递进位`; `输入进位`; `输出进位（外部进位）`; `有/无符号读法的结果`.                                           |
| Shell            | P2       | `COMPUTING LAB / LOCAL`, `LAB REGISTRY`, `Local workspace` are branding/internal language.                                   | `计算实验室 · 本地运行`; `实验目录`; `本地学习空间`.                                                                                     |

## Copy rules

- Use Chinese as the sentence subject; name the actor (`发送方`, `接收方`, `这一行结果`, `当前步骤`).
- Introduce a canonical technical term only when it is needed, with Chinese first and English in parentheses once.
- Use concrete questions instead of abstract section labels.
- Keep answer-bearing explanations in result/evidence regions, not before the first learner action.
- Split one sentence when it introduces more than one new concept.
- Treat this as a simulated critic report. It identifies copy and sequence risk, not confirmed real-human failure.
