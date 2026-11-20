import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { Icon } from "../../../shared/ui/Icon";
import type { DecodingWorkspaceProps } from "../controller/viewModel.ts";
import { BytePanel } from "./BytePanel.tsx";
import { ConceptPanel } from "./ConceptPanel.tsx";
import { DecodeEditor } from "./DecodeEditor.tsx";
import { DecodingStageRail } from "./DecodingStageRail.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { PixelCanvas } from "./PixelCanvas.tsx";
import { SampleBytes } from "./SampleBytes.tsx";
import { StageBrief } from "./StageBrief.tsx";
import { TextResult } from "./TextResult.tsx";
import "./decoding.css";

export function DecodingWorkspace({ model, actions, resetControls }: DecodingWorkspaceProps) {
  const { stage, feedback, payload, editor, output, concepts, submission, judge } = model;
  const sample = output?.sample ?? null;
  return (
    <LabPageShell
      collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
      labId="decoding"
      rail={<DecodingStageRail model={model.rail} onSelect={actions.selectStage} />}
      railWidth={220}
      resetControls={resetControls}
    >
      <main aria-label="解码实验区" className="decoding-workspace">
        {stage ? <StageBrief passed={model.stagePassed} stage={stage} /> : null}

        {feedback.message ? (
          <p className="test-error" role="alert">
            {feedback.message}
            <button onClick={actions.dismissMessage} type="button">
              <Icon name="x" size={12} />
            </button>
          </p>
        ) : null}
        {feedback.error ? (
          <p className="test-error" role="alert">
            {feedback.error}
          </p>
        ) : null}

        {stage && payload ? (
          <>
            {payload.kind === "files" ? (
              <FilesPanel
                onVerdict={(fileIndex, verdict, expectDecoder) =>
                  actions.setVerdict(fileIndex, verdict, expectDecoder)
                }
                payload={payload}
                verdicts={model.verdicts}
              />
            ) : editor && output ? (
              <div className="decoder-console">
                <BytePanel
                  key={stage.id}
                  payload={payload}
                  allowHeightPractice={stage.id === "rescue-bmp"}
                />
                <DecodeEditor
                  code={editor.template}
                  fills={editor.fills}
                  onFill={actions.setFill}
                  onPrintExample={actions.printExample}
                  onRun={actions.run}
                  onSampleFill={actions.setSampleFill}
                  running={editor.running}
                  sampleFills={editor.sampleFills}
                  stage={stage}
                />
                <section aria-label="解码结果" className="decode-output">
                  <div className="decoding-panel-heading">
                    <h3>解码结果</h3>
                    {stage.kind === "bmp-script" ? (
                      <button
                        className="button button-ghost"
                        disabled={editor.running}
                        onClick={actions.runPreview}
                        type="button"
                      >
                        先预览这张图
                      </button>
                    ) : null}
                  </div>
                  {stage.example && sample ? (
                    <div className="decode-example-output">
                      {stage.example.run &&
                      (stage.kind === "bmp" || stage.kind === "bmp-script") ? (
                        <>
                          {sample.printout !== null ? (
                            <SampleBytes pixels={sample.pixels} raw={sample.printout} />
                          ) : (
                            <>
                              <h4>样例输入</h4>
                              <p className="decode-example-empty">
                                点左边 ▶ 运行「输入生成器」后显示
                              </p>
                            </>
                          )}
                          <h4>样例输出</h4>
                          {sample.pixels ? (
                            <>
                              <PixelCanvas
                                ariaLabel="样例输出图案"
                                onPixelHover={actions.setSampleHover}
                                pixels={sample.pixels}
                              />
                              <p className="decode-example-hover">
                                {sample.hover
                                  ? `y=${sample.hover.y} x=${sample.hover.x} → [${sample.hover.rgb.join(", ")}]`
                                  : "把鼠标移到图上，可查看每个像素的 y、x 和 [R, G, B]"}
                              </p>
                            </>
                          ) : (
                            <p className="decode-example-empty">
                              这份样例 data 按 BMP 约定解出的图案
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <h4>样例输出</h4>
                          <pre>
                            <code>
                              {sample.printout ?? stage.example.output ?? "运行样例后显示"}
                            </code>
                          </pre>
                        </>
                      )}
                      {sample.error ? (
                        <p className="decode-example-error" role="alert">
                          {sample.error}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {output.runError ? (
                    <pre className="python-error" role="alert">
                      {output.runError}
                    </pre>
                  ) : null}
                  {output.preview ? (
                    <div className="preview-block">
                      <PixelCanvas ariaLabel="图片预览" pixels={output.preview} />
                      <p className="preview-note">
                        按 BMP 约定读是一张正常图片——但传入的数值里似乎不只是颜色。
                      </p>
                    </div>
                  ) : null}
                  {output.lastRun && "text" in output.lastRun ? (
                    <TextResult stage={stage} text={output.lastRun.text} />
                  ) : null}
                  {stage.kind === "bmp" && output.targetPixels ? (
                    <div className="pixel-compare">
                      <figure>
                        <PixelCanvas ariaLabel="目标图案" pixels={output.targetPixels} />
                        <figcaption>目标图案</figcaption>
                      </figure>
                      <figure>
                        {output.lastRun && "pixels" in output.lastRun ? (
                          <PixelCanvas
                            ariaLabel="你的解码结果"
                            diffAgainst={output.targetPixels}
                            pixels={output.lastRun.pixels}
                          />
                        ) : (
                          <div className="pixel-compare-empty">?</div>
                        )}
                        <figcaption>
                          你的解码结果
                          {output.pixelDiff !== null ? ` · ${output.pixelDiff} 个像素不同` : ""}
                        </figcaption>
                      </figure>
                    </div>
                  ) : null}
                  {!output.lastRun &&
                  !output.runError &&
                  !output.preview &&
                  stage.kind !== "bmp" ? (
                    <p className="output-empty">运行 decode 后，结果会出现在这里。</p>
                  ) : null}
                </section>
              </div>
            ) : null}

            <ConceptPanel
              answered={concepts.answered}
              onAnswer={actions.answerPrompt}
              stage={stage}
              wrongPick={concepts.wrongPick}
            />

            <div className="submit-row">
              <button
                className="button button-primary"
                disabled={submission.submitting || submission.blocker !== null}
                onClick={() => void actions.submit()}
                type="button"
              >
                {submission.submitting ? "判定中…" : "提交判定"}
              </button>
              <span className="submit-note">
                {submission.blocker ?? "提交你还原出的结果，由服务器判定。"}
              </span>
            </div>

            {judge ? (
              <section
                aria-label="判定结果"
                className={`judge-result${judge.outcome.passed ? " is-passed" : ""}`}
              >
                <h3>{judge.outcome.passed ? "判定通过 ✓" : "判定未通过"}</h3>
                {judge.outcome.passed && judge.nextStageIndex !== null ? (
                  <button
                    className="button button-primary judge-next"
                    onClick={() => actions.selectStage(judge.nextStageIndex!)}
                    type="button"
                  >
                    前往下一关 →
                  </button>
                ) : null}
                <ol>
                  {judge.outcome.parts.map((part) => (
                    <li className={part.ok ? "is-ok" : "is-bad"} key={part.id}>
                      <strong>{part.label}</strong>
                      <span>{part.detail}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </LabPageShell>
  );
}
