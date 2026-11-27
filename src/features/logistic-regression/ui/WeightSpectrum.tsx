import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { findTrainingExamplesForWord, type WordWeightEntry } from "../domain/logisticRegression.ts";

export function WeightSpectrum(props: {
  topSpam: readonly WordWeightEntry[];
  topHam: readonly WordWeightEntry[];
  trainCount: number;
  heading?: string;
}) {
  const [selectedWord, setSelectedWord] = createSignal<string | null>(null);

  const heading = () => props.heading ?? "哪些词的权重较大";

  const maxAbs = createMemo(() =>
    Math.max(
      0.5,
      ...props.topSpam.map((w) => Math.abs(w.weight)),
      ...props.topHam.map((w) => Math.abs(w.weight)),
    ),
  );

  const activeWord = createMemo(() => {
    const sel = selectedWord();
    if (
      sel &&
      (props.topSpam.some((w) => w.word === sel) || props.topHam.some((w) => w.word === sel))
    ) {
      return sel;
    }
    return props.topSpam[0]?.word ?? props.topHam[0]?.word ?? null;
  });

  const examples = createMemo(() => {
    const word = activeWord();
    return word ? findTrainingExamplesForWord(word, props.trainCount, 3) : [];
  });

  return (
    <section class="logistic-regression-panel logistic-regression-spectrum">
      <div class="logistic-regression-panel-head">
        <h3>{heading()}</h3>
        <span class="logistic-regression-muted-note">
          点击任意词语，查看训练集里包含它的真实短信
        </span>
      </div>

      <Show
        fallback={
          <div class="logistic-regression-spectrum-cols">
            <div>
              <p class="logistic-regression-col-title is-danger">正权重较大的词（提高垃圾概率）</p>
              <ul class="logistic-regression-weight-list">
                <For each={props.topSpam}>
                  {(item) => (
                    <li>
                      <Button
                        class={`logistic-regression-weight-btn${activeWord() === item.word ? " is-selected" : ""}`}
                        onClick={() => setSelectedWord(item.word)}
                        type="button"
                      >
                        <span class="logistic-regression-weight-word">{item.word}</span>
                        <span class="logistic-regression-weight-bar-track">
                          <span
                            class="logistic-regression-weight-bar is-pos"
                            style={{ width: `${(item.weight / maxAbs()) * 100}%` }}
                          />
                        </span>
                        <span class="logistic-regression-mono logistic-regression-weight-num is-pos">
                          +{item.weight.toFixed(2)}
                        </span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </div>

            <div>
              <p class="logistic-regression-col-title is-success">负权重较大的词（降低垃圾概率）</p>
              <ul class="logistic-regression-weight-list">
                <For each={props.topHam}>
                  {(item) => (
                    <li>
                      <Button
                        class={`logistic-regression-weight-btn${activeWord() === item.word ? " is-selected" : ""}`}
                        onClick={() => setSelectedWord(item.word)}
                        type="button"
                      >
                        <span class="logistic-regression-weight-word">{item.word}</span>
                        <span class="logistic-regression-weight-bar-track">
                          <span
                            class="logistic-regression-weight-bar is-neg"
                            style={{ width: `${(Math.abs(item.weight) / maxAbs()) * 100}%` }}
                          />
                        </span>
                        <span class="logistic-regression-mono logistic-regression-weight-num is-neg">
                          {item.weight.toFixed(2)}
                        </span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </div>
        }
        when={props.topSpam.length === 0 && props.topHam.length === 0}
      >
        <p class="logistic-regression-muted-note">
          第 0 轮是训练前的权重，各个词都是 0。拖动回放滑块可以查看已经计算好的后续轮次。
        </p>
      </Show>

      <Show when={activeWord() && examples().length > 0}>
        <div class="logistic-regression-word-examples">
          <p class="logistic-regression-subhead">
            训练集中包含「<strong>{activeWord()}</strong>」的短信：
          </p>
          <ul>
            <For each={examples()}>
              {(ex) => (
                <li>
                  <span
                    class={`logistic-regression-pill ${ex.label === 1 ? "is-danger" : "is-success"}`}
                  >
                    {ex.label === 1 ? "垃圾" : "正常"}
                  </span>
                  <span>{ex.text}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </section>
  );
}
