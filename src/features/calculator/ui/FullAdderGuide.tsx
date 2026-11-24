import { useEffect, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";

export function FullAdderGuide({
  classId,
  onAcknowledged,
}: {
  classId: string;
  onAcknowledged: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = card.current;
    if (document.activeElement instanceof HTMLElement)
      previousFocus.current = document.activeElement;
    if (element && typeof element.showPopover === "function") {
      element.popover = "manual";
      element.showPopover();
    }
  }, []);

  async function acknowledge() {
    setSaving(true);
    setError("");
    try {
      await api.post(`/api/classes/${classId}/labs/calculator/guide/full-adder/acknowledge`);
      if (card.current?.contains(document.activeElement)) previousFocus.current?.focus();
      onAcknowledged();
    } catch (cause) {
      setError(`确认未保存。${describeApiError(cause)}请再点一次“我知道了”。`);
      setSaving(false);
    }
  }

  return (
    <section ref={card} className="full-adder-guide" aria-labelledby="full-adder-guide-title">
      <h2 id="full-adder-guide-title">用上你搭好的半加器</h2>
      <p>
        展开关卡栏，在“我的组件”里点击
        HalfAdder，就能把半加器放到画布上。再点一次可以放入第二个，用它接着加上进位 Cin。
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        className="button button-primary"
        type="button"
        disabled={saving}
        onClick={acknowledge}
      >
        {saving ? "正在保存…" : "我知道了"}
      </button>
    </section>
  );
}
