import { Button } from "@ui-sdk/solid/button";
import { createSignal, onSettled, Show } from "solid-js";
import { describeRuntimeError } from "../../../shared/lab/contracts";
import { useLabRuntime } from "../../../shared/lab/runtime";

export function FullAdderGuide(props: { scopeId: string; onAcknowledged: () => void }) {
  const { transport } = useLabRuntime();
  let card: HTMLElement | undefined;
  let previousFocus: HTMLElement | null = null;
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  onSettled(() => {
    if (document.activeElement instanceof HTMLElement) {
      previousFocus = document.activeElement;
    }
  });

  async function acknowledge() {
    setSaving(true);
    setError("");
    try {
      await transport.acknowledgeGuide(props.scopeId);
      if (card?.contains(document.activeElement)) previousFocus?.focus();
      props.onAcknowledged();
    } catch (cause) {
      setError(`确认未保存。${describeRuntimeError(cause)}请再点一次“我知道了”。`);
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="full-adder-guide-title"
      class="full-adder-guide"
      ref={(el) => {
        card = el;
      }}
    >
      <h2 id="full-adder-guide-title">用上你搭好的半加器</h2>
      <p>
        展开关卡栏，在“我的组件”里点击
        HalfAdder，就能把半加器放到画布上。再点一次可以放入第二个，用它接着加上进位 Cin。
      </p>
      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
      <Button
        class="button button-primary"
        disabled={saving()}
        onClick={() => void acknowledge()}
        type="button"
      >
        {saving() ? "正在保存…" : "我知道了"}
      </Button>
    </section>
  );
}
