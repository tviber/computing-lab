import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";

type ExperimentValue = {
  id: string;
  label: string;
  value: number;
  display: string;
};

type Experiment = {
  parameters: readonly ExperimentValue[];
  metrics: readonly ExperimentValue[];
};

export function ExperimentComparison(props: Experiment) {
  const [record, setRecord] = createSignal<Experiment | null>(null);

  const changed = createMemo(() => {
    const rec = record();
    if (!rec) return [];
    return props.parameters.filter((parameter) =>
      rec.parameters.some((saved) => saved.id === parameter.id && saved.value !== parameter.value),
    );
  });

  const combinedItems = createMemo(() => [...props.parameters, ...props.metrics]);

  return (
    <section aria-label="比较两次实验" class="logistic-regression-experiment-comparison">
      <div class="logistic-regression-panel-head">
        <h3>比较两次实验</h3>
        <div class="logistic-regression-preset-row">
          <Button
            class="button button-ghost"
            onClick={() =>
              setRecord({
                parameters: props.parameters.map((item) => ({ ...item })),
                metrics: props.metrics.map((item) => ({ ...item })),
              })
            }
            type="button"
          >
            {record() ? "用当前结果更新记录" : "记录当前结果作对照"}
          </Button>
          <Show when={record()}>
            <Button class="button button-ghost" onClick={() => setRecord(null)} type="button">
              清除对照记录
            </Button>
          </Show>
        </div>
      </div>
      <p class="logistic-regression-muted-note">
        先记录一组结果，再只改变一个参数。记录只保留在当前页面，离开本关后清除。
      </p>
      <Show when={record()}>
        {(rec) => (
          <>
            <p class="logistic-regression-muted-note" role="status">
              {changed().length === 0
                ? "参数与记录相同。先改变一项，看看结果怎样变化。"
                : changed().length === 1
                  ? `本次只改变了：${changed()[0].label}。比较结果，再解释变化。`
                  : `同时改变了：${changed()
                      .map((item) => item.label)
                      .join("、")}。先只改一项，更容易判断原因。`}
            </p>
            <table class="logistic-regression-comparison-table">
              <caption>已记录与当前的公开实验结果</caption>
              <thead>
                <tr>
                  <th scope="col">参数 / 指标</th>
                  <th scope="col">已记录</th>
                  <th scope="col">当前</th>
                </tr>
              </thead>
              <tbody>
                <For each={combinedItems()}>
                  {(item) => {
                    const saved = () =>
                      [...rec().parameters, ...rec().metrics].find((entry) => entry.id === item.id);
                    return (
                      <tr>
                        <th scope="row">{item.label}</th>
                        <td>{saved()?.display}</td>
                        <td>{item.display}</td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </>
        )}
      </Show>
    </section>
  );
}
