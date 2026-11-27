import { createMemo, createSignal, For, Show } from "solid-js";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import { INTAKE_TRIAGE_CASES, type TriageDecision } from "../domain/scenarios.ts";

export function TriageIntro(props: { orders: { id: string; request: string }[] }) {
  const [decisions, setDecisions] = createSignal<Record<string, TriageDecision>>({});
  const cases = createMemo(() =>
    INTAKE_TRIAGE_CASES.flatMap((item) => {
      const order = props.orders.find((entry) => entry.id === item.id);
      return order ? [{ ...item, request: order.request }] : [];
    }),
  );
  const decide = (id: string, decision: TriageDecision) =>
    setDecisions((current) => ({ ...current, [id]: decision }));

  return (
    <Show when={cases().length >= 2}>
      <section class="lunch-triage">
        <p class="eyebrow">先当一次质检员</p>
        <h2>这两张小票，你会直接出票吗？</h2>
        <p>
          AI
          已经写好草稿，但没有告诉你自己有多确定。先凭顾客的原话判断：直接出票，还是请他再说一遍？
        </p>
        <div class="lunch-triage-grid">
          <For each={cases()}>
            {(item) => (
              <article class="lunch-triage-card">
                <p class="lunch-triage-title">{item.title}</p>
                <blockquote>“{item.request}”</blockquote>
                <div class="lunch-triage-draft">
                  <span>AI 草稿</span>
                  <b>{item.draft}</b>
                  <small>{item.draftNote}</small>
                </div>
                <SegmentedPicker
                  class="lunch-triage-actions"
                  label={`${item.title} 的处理方式`}
                  onChange={(decision) => decide(item.id, decision as TriageDecision)}
                  options={[
                    { value: "direct", label: "直接出票" },
                    { value: "ask", label: "停 1 拍，问顾客" },
                  ]}
                  value={decisions()[item.id] ?? ""}
                />
                <Show when={decisions()[item.id]}>
                  {(decision) => (
                    <p
                      class={`lunch-feedback ${
                        decision() === "ask" ? item.askTone : item.directTone
                      }`}
                      role="status"
                    >
                      {decision() === "ask" ? item.ask : item.direct}
                    </p>
                  )}
                </Show>
              </article>
            )}
          </For>
        </div>
        <Show when={Object.keys(decisions()).length >= 2}>
          <p class="lunch-note">
            这两单都不能放心直接出票。接下来把 12 张单一起交给
            AI，你要写一个函数，替自己挑出该问的单。
          </p>
        </Show>
      </section>
    </Show>
  );
}
