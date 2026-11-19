import { hasCloze } from "../domain/cloze.ts";
import type { DecodingStageDef } from "../domain/stages.ts";
import { ClozeEditor } from "./ClozeEditor.tsx";

export function DecodeEditor({
  stage,
  code,
  fills,
  running,
  onFill,
  onRun,
  onPrintExample,
  sampleFills,
  onSampleFill,
}: {
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
    <section aria-label="解码器" className="decode-editor">
      <div className="decoding-panel-heading">
        <h3>你的解码器</h3>
      </div>
      <p className="decoding-panel-note decode-editor-note">
        把每个空填上，你的 <code>decode(data)</code> 就写好了。
      </p>
      {stage.example ? (
        <aside
          aria-label={stage.example.run ? "输入生成器" : "样例输入"}
          className="decode-example"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (stage.example?.run && !running) onPrintExample();
            }}
          >
            <div className="decode-example-heading">
              <h4>{stage.example.run ? "输入生成器" : "样例输入"}</h4>
              {stage.example.run ? (
                <button
                  aria-label="运行输入生成器，得到样例输入"
                  className="decode-example-play"
                  disabled={running}
                  title="运行生成器，得到样例输入"
                  type="submit"
                >
                  ▶
                </button>
              ) : null}
            </div>
            {hasCloze(stage.example.input) ? (
              <>
                <ClozeEditor
                  ariaLabel="输入生成器代码"
                  blankLabel={() => "表达式，可编辑——改完点 ▶ 重新生成"}
                  code={stage.example.input}
                  fills={sampleFills}
                  onFill={onSampleFill}
                />
                <p className="decode-example-empty">表达式可改——改完点 ▶ 看字节流和图案怎么变</p>
              </>
            ) : (
              <pre>
                <code>{stage.example.input}</code>
              </pre>
            )}
          </form>
        </aside>
      ) : null}
      <ClozeEditor code={code} fills={fills} onFill={onFill} />
      <div className="guided-actions">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={onRun}
          type="button"
        >
          {running ? "运行中…" : "运行 decode"}
        </button>
        {stage.kind === "bmp-script" ? (
          <span className="helper-note-inline">
            已提供 <code>decode_bmp(data)</code> 可直接调用。
          </span>
        ) : null}
      </div>
    </section>
  );
}
