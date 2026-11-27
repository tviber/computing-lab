/**
 * Test results panel. Public debug cases run locally; hidden cases come
 * back from the judge. Expected and actual values are rendered through
 * the stage's declared buses so a case reads as MSB-first binary numbers
 * (with decimal readings), not as scattered pin assignments. Bits that
 * differ from the expectation get a <mark>, not just a color. Pins not
 * covered by any bus still appear as `pin=值` so nothing is lost.
 */

import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { readBus } from "../domain/bus";
import type { Bit } from "../domain/graph";
import type { BusDef, StageDef } from "../domain/stages";
import type { JudgeOutcome, RunOutcome } from "../lesson/state";
import { AnnotatedText } from "./CalculatorTerms";

const ERROR_HINTS: Record<string, string> = {
  cycle: "这里形成了环：某个元件的输出绕回来成了自己的输入。沿着导线找回路，删掉其中一根。",
  unresolved: "有输出引脚还没有信号来源：找到右侧对应的输出端口，看看有没有导线连过去。",
  depth: "自定义组件嵌套层数过多——检查组件里是否套用了它自己或互相套用。",
};

function busesFor(stage: StageDef | undefined, role: BusDef["role"]): BusDef[] {
  return (stage?.buses ?? []).filter((bus) => bus.role === role);
}

/** One bus read against a case's pin values, MSB first + decimal. */
function CaseBusValue(props: {
  bus: BusDef;
  values: Record<string, Bit | null>;
  compareTo?: Record<string, Bit>;
}) {
  const reading = createMemo(() => readBus(props.bus, props.values));

  return (
    <span class="case-bus">
      <span class="case-bus-name">
        <AnnotatedText text={props.bus.name} />
      </span>
      <code aria-label={`${props.bus.name} ${reading().text}`} class="case-bus-bits">
        <Show when={props.bus.implicitSign}>
          <span class="case-sign-bit">{reading().signBit ?? "?"}</span>
        </Show>
        <For each={props.bus.pins}>
          {(pin, i) => {
            const bit = () => reading().bits[i()];
            const differs = () =>
              props.compareTo != null &&
              props.compareTo[pin] !== undefined &&
              bit() !== props.compareTo[pin];
            return (
              <Show fallback={<span>{bit() ?? "?"}</span>} when={differs()}>
                <mark>{bit() ?? "?"}</mark>
              </Show>
            );
          }}
        </For>
      </code>
      <span class="case-bus-number">（{reading().unsigned ?? "—"}）</span>
      <Show when={props.bus.signed}>
        <span class="case-bus-number">（补码 {reading().signed ?? "—"}）</span>
      </Show>
    </span>
  );
}

/** All buses of one role, plus bare pins no bus covers. */
function CaseValues(props: {
  buses: BusDef[];
  values: Record<string, Bit | null>;
  compareTo?: Record<string, Bit>;
  /** Case inputs, merged in so implied sign bits can be derived. */
  inputs?: Record<string, Bit>;
}) {
  const covered = createMemo(() => new Set(props.buses.flatMap((bus) => bus.pins)));
  const bare = createMemo(() => Object.keys(props.values).filter((pin) => !covered().has(pin)));
  const context = createMemo(() =>
    props.inputs ? { ...props.inputs, ...props.values } : props.values,
  );

  return (
    <span class="case-values">
      <For each={props.buses}>
        {(bus) => <CaseBusValue bus={bus} compareTo={props.compareTo} values={context()} />}
      </For>
      <Show when={bare().length > 0}>
        <code class="case-pins">
          {bare()
            .map((pin) => `${pin}=${props.values[pin] ?? "—"}`)
            .join(" ")}
        </code>
      </Show>
    </span>
  );
}

/** Short "0110（6）" phrase per output bus for the counterexample sentence. */
function busPhrase(buses: BusDef[], values: Record<string, Bit | null>): string {
  return buses
    .map((bus) => {
      const reading = readBus(bus, values);
      const number = `${reading.text}（${reading.unsigned ?? "—"}）`;
      return buses.length > 1 ? `${bus.name} ${number}` : number;
    })
    .join("，");
}

function CounterexampleBlock(props: {
  stage: StageDef | undefined;
  counterexample: NonNullable<NonNullable<JudgeOutcome>["counterexample"]>;
}) {
  const inputBuses = createMemo(() => busesFor(props.stage, "input"));
  const outputBuses = createMemo(() => busesFor(props.stage, "output"));

  return (
    <div class="test-counterexample">
      <p class="eyebrow">最小反例</p>
      <dl class="counterexample-rows">
        <div>
          <dt>用例</dt>
          <dd>
            {props.counterexample.name}（<AnnotatedText text={props.counterexample.category} />）
          </dd>
        </div>
        <div>
          <dt>输入</dt>
          <dd>
            <CaseValues buses={inputBuses()} values={props.counterexample.inputs} />
          </dd>
        </div>
        <div>
          <dt>期望</dt>
          <dd>
            <CaseValues
              buses={outputBuses()}
              inputs={props.counterexample.inputs}
              values={props.counterexample.expected}
            />
          </dd>
        </div>
        <div>
          <dt>实际</dt>
          <dd>
            <CaseValues
              buses={outputBuses()}
              compareTo={props.counterexample.expected}
              inputs={props.counterexample.inputs}
              values={props.counterexample.actual}
            />
          </dd>
        </div>
      </dl>
      <p class="counterexample-note">
        这一组输入下，你的电路给出 {busPhrase(outputBuses(), props.counterexample.actual)}
        ，应为 {busPhrase(outputBuses(), props.counterexample.expected)}。
      </p>
    </div>
  );
}

export function TestPanel(props: {
  stage: StageDef | undefined;
  runOutcome: RunOutcome;
  judgeOutcome: JudgeOutcome;
}) {
  const outputBuses = createMemo(() => busesFor(props.stage, "output"));

  return (
    <Switch
      fallback={
        <section aria-label="测试结果" class="test-panel is-empty">
          <p>点击「运行公开测试」在本地快速验证，确认无误后再提交。</p>
        </section>
      }
    >
      <Match when={props.judgeOutcome}>
        {(judge) => {
          const failedCategories = createMemo(() =>
            Object.entries(judge().categories).filter(([, bucket]) => bucket.passed < bucket.total),
          );
          return (
            <section aria-label="提交结果" class="test-panel">
              <header class={`test-verdict${judge().passed ? " is-pass" : " is-fail"}`}>
                <strong>{judge().passed ? "通过" : "未通过"}</strong>
                <span class="test-score">
                  {judge().score} / {judge().total}
                </span>
                <span class="test-note">关卡判定结果</span>
              </header>

              <Show when={judge().error}>
                {(err) => (
                  <p class="test-error" role="alert">
                    {ERROR_HINTS[err().split(":")[0]] ?? err()}
                  </p>
                )}
              </Show>

              <Show when={failedCategories().length > 0}>
                <div class="test-categories">
                  <p class="eyebrow">失败的用例类别</p>
                  <ul>
                    <For each={failedCategories()}>
                      {([category, bucket]) => (
                        <li>
                          <span class="category-name">
                            <AnnotatedText text={category} />
                          </span>
                          <span class="category-score">
                            {bucket.passed} / {bucket.total}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={judge().counterexample}>
                {(ce) => <CounterexampleBlock counterexample={ce()} stage={props.stage} />}
              </Show>
            </section>
          );
        }}
      </Match>
      <Match when={props.runOutcome}>
        {(run) => (
          <section aria-label="测试结果" class="test-panel">
            <header class={`test-verdict${run().score === run().total ? " is-pass" : " is-fail"}`}>
              <strong>公开测试</strong>
              <span class="test-score">
                {run().score} / {run().total}
              </span>
              <span class="test-note">公开用例仅供调试，不影响解锁</span>
            </header>

            <table class="test-table">
              <caption class="sr-only">公开测试用例结果</caption>
              <thead>
                <tr>
                  <th scope="col">用例</th>
                  <th scope="col">结果</th>
                  <th scope="col">期望</th>
                  <th scope="col">实际</th>
                </tr>
              </thead>
              <tbody>
                <For each={run().results}>
                  {(result) => (
                    <tr class={result.passed ? "is-pass" : "is-fail"}>
                      <th scope="row">
                        <AnnotatedText text={result.name} />
                      </th>
                      <td>
                        <Show fallback={<Icon name="x" size={13} />} when={result.passed}>
                          <Icon name="check" size={13} />
                        </Show>
                      </td>
                      <td>
                        <CaseValues
                          buses={outputBuses()}
                          inputs={result.inputs}
                          values={result.expected}
                        />
                      </td>
                      <td>
                        <Show
                          fallback={
                            <CaseValues
                              buses={outputBuses()}
                              compareTo={result.expected}
                              inputs={result.inputs}
                              values={result.actual}
                            />
                          }
                          when={result.error}
                        >
                          {(err) => <code>{ERROR_HINTS[err().kind] ?? err().kind}</code>}
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
        )}
      </Match>
    </Switch>
  );
}
