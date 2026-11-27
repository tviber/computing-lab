import { Button } from "@ui-sdk/solid/button";
import { Show } from "solid-js";
import { PythonCode } from "../../../shared/ui/PythonCode";
import { hasCloze } from "../domain/cloze.ts";
import type { DecodingStageDef } from "../domain/stages.ts";
import { ClozeEditor } from "./ClozeEditor.tsx";

export function DecodeEditor(props: {
  stage: DecodingStageDef;
  code: string;
  fills: Record<string, string>;
  running: boolean;
  onFill: (blankId: string, value: string) => void;
  onRun: () => void;
  onPrintExample: () => void;
  sampleFills: Record<string, string>;
  onSampleFill: (blankId: string, value: string) => void;
}) {
  return (
    <section aria-label="解码器" class="decode-editor">
      <div class="decoding-panel-heading">
        <h3>你的解码器</h3>
      </div>
      <p class="decoding-panel-note decode-editor-note">
        把每个空填上，你的 <code>decode(data)</code> 就写好了。
      </p>
      <Show when={props.stage.example}>
        {(example) => (
          <aside aria-label={example().run ? "输入生成器" : "样例输入"} class="decode-example">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (example().run && !props.running) props.onPrintExample();
              }}
            >
              <div class="decode-example-heading">
                <h4>{example().run ? "输入生成器" : "样例输入"}</h4>
                <Show when={example().run}>
                  <Button
                    aria-label="运行输入生成器，得到样例输入"
                    class="decode-example-play"
                    disabled={props.running}
                    title="运行生成器，得到样例输入"
                    type="submit"
                  >
                    ▶
                  </Button>
                </Show>
              </div>
              <Show
                fallback={<PythonCode ariaLabel="输入生成器代码" code={example().input} />}
                when={hasCloze(example().input)}
              >
                <ClozeEditor
                  ariaLabel="输入生成器代码"
                  blankLabel={() => "表达式，可编辑——改完点 ▶ 重新生成"}
                  code={example().input}
                  fills={props.sampleFills}
                  onFill={props.onSampleFill}
                />
                <p class="decode-example-empty">表达式可改——改完点 ▶ 看字节流和图案怎么变</p>
              </Show>
            </form>
          </aside>
        )}
      </Show>
      <ClozeEditor code={props.code} fills={props.fills} onFill={props.onFill} />
      <div class="guided-actions">
        <Button
          class="button button-secondary"
          disabled={props.running}
          onClick={() => props.onRun()}
          type="button"
        >
          {props.running ? "运行中…" : "运行 decode"}
        </Button>
        <Show when={props.stage.kind === "bmp-script"}>
          <span class="helper-note-inline">
            已提供 <code>decode_bmp(data)</code> 可直接调用。
          </span>
        </Show>
      </div>
    </section>
  );
}
