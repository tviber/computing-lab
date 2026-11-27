import { Button } from "@ui-sdk/solid/button";
import { For, Show } from "solid-js";
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

export function DecodingWorkspace(props: DecodingWorkspaceProps) {
  const stage = () => props.model.stage;
  const feedback = () => props.model.feedback;
  const payload = () => props.model.payload;
  const editor = () => props.model.editor;
  const output = () => props.model.output;
  const sample = () => props.model.output?.sample ?? null;
  const concepts = () => props.model.concepts;
  const submission = () => props.model.submission;
  const judge = () => props.model.judge;

  return (
    <LabPageShell
      collapsedLabel={stage() ? `第 ${stage()!.index} 关` : undefined}
      labId="decoding"
      rail={<DecodingStageRail model={props.model.rail} onSelect={props.actions.selectStage} />}
      railWidth={220}
      resetControls={props.resetControls}
    >
      <main aria-label="解码实验区" class="decoding-workspace">
        <Show when={stage()}>
          {(currentStage) => <StageBrief passed={props.model.stagePassed} stage={currentStage()} />}
        </Show>

        <Show when={feedback().message}>
          {(msg) => (
            <p class="test-error" role="alert">
              {msg()}
              <Button
                aria-label="关闭"
                onClick={() => props.actions.dismissMessage()}
                type="button"
              >
                <Icon name="x" size={12} />
              </Button>
            </p>
          )}
        </Show>
        <Show when={feedback().error}>
          {(err) => (
            <p class="test-error" role="alert">
              {err()}
            </p>
          )}
        </Show>

        <Show when={stage() && payload() ? { stage: stage()!, payload: payload()! } : null}>
          {(ready) => (
            <>
              <Show
                fallback={
                  <Show
                    when={editor() && output() ? { editor: editor()!, output: output()! } : null}
                  >
                    {(consoleData) => (
                      <div class="decoder-console">
                        <Show keyed when={ready().stage.id}>
                          {(_) => (
                            <BytePanel
                              allowHeightPractice={ready().stage.id === "rescue-bmp"}
                              payload={ready().payload}
                            />
                          )}
                        </Show>
                        <DecodeEditor
                          code={consoleData().editor.template}
                          fills={consoleData().editor.fills}
                          onFill={props.actions.setFill}
                          onPrintExample={props.actions.printExample}
                          onRun={props.actions.run}
                          onSampleFill={props.actions.setSampleFill}
                          running={consoleData().editor.running}
                          sampleFills={consoleData().editor.sampleFills}
                          stage={ready().stage}
                        />
                        <section aria-label="解码结果" class="decode-output">
                          <div class="decoding-panel-heading">
                            <h3>解码结果</h3>
                            <Show when={ready().stage.kind === "bmp-script"}>
                              <Button
                                class="button button-ghost"
                                disabled={consoleData().editor.running}
                                onClick={() => props.actions.runPreview()}
                                type="button"
                              >
                                先预览这张图
                              </Button>
                            </Show>
                          </div>
                          <Show when={ready().stage.example && sample()}>
                            {(sampleData) => (
                              <div class="decode-example-output">
                                <Show
                                  fallback={
                                    <>
                                      <h4>样例输出</h4>
                                      <pre>
                                        <code>
                                          {sampleData().printout ??
                                            ready().stage.example?.output ??
                                            "运行样例后显示"}
                                        </code>
                                      </pre>
                                    </>
                                  }
                                  when={
                                    ready().stage.example?.run &&
                                    (ready().stage.kind === "bmp" ||
                                      ready().stage.kind === "bmp-script")
                                  }
                                >
                                  <Show
                                    fallback={
                                      <>
                                        <h4>样例输入</h4>
                                        <p class="decode-example-empty">
                                          点左边 ▶ 运行「输入生成器」后显示
                                        </p>
                                      </>
                                    }
                                    when={sampleData().printout !== null}
                                  >
                                    <SampleBytes
                                      pixels={sampleData().pixels}
                                      raw={sampleData().printout!}
                                    />
                                  </Show>
                                  <h4>样例输出</h4>
                                  <Show
                                    fallback={
                                      <p class="decode-example-empty">
                                        这份样例 data 按 BMP 约定解出的图案
                                      </p>
                                    }
                                    when={sampleData().pixels}
                                  >
                                    {(samplePixels) => (
                                      <>
                                        <PixelCanvas
                                          ariaLabel="样例输出图案"
                                          onPixelHover={props.actions.setSampleHover}
                                          pixels={samplePixels()}
                                        />
                                        <p class="decode-example-hover">
                                          {sampleData().hover
                                            ? `y=${sampleData().hover!.y} x=${sampleData().hover!.x} → [${sampleData().hover!.rgb.join(", ")}]`
                                            : "把鼠标移到图上，可查看每个像素的 y、x 和 [R, G, B]"}
                                        </p>
                                      </>
                                    )}
                                  </Show>
                                </Show>
                                <Show when={sampleData().error}>
                                  {(sampleErr) => (
                                    <p class="decode-example-error" role="alert">
                                      {sampleErr()}
                                    </p>
                                  )}
                                </Show>
                              </div>
                            )}
                          </Show>
                          <Show when={consoleData().output.runError}>
                            {(runErr) => (
                              <pre class="python-error" role="alert">
                                {runErr()}
                              </pre>
                            )}
                          </Show>
                          <Show when={consoleData().output.preview}>
                            {(previewPixels) => (
                              <div class="preview-block">
                                <PixelCanvas ariaLabel="图片预览" pixels={previewPixels()} />
                                <p class="preview-note">
                                  按 BMP 约定读是一张正常图片——但传入的数值里似乎不只是颜色。
                                </p>
                              </div>
                            )}
                          </Show>
                          <Show
                            when={
                              consoleData().output.lastRun &&
                              "text" in consoleData().output.lastRun!
                                ? (consoleData().output.lastRun as { text: string }).text
                                : null
                            }
                          >
                            {(decodedText) => (
                              <TextResult stage={ready().stage} text={decodedText()} />
                            )}
                          </Show>
                          <Show
                            when={
                              ready().stage.kind === "bmp"
                                ? consoleData().output.targetPixels
                                : null
                            }
                          >
                            {(targetPixels) => (
                              <div class="pixel-compare">
                                <figure>
                                  <PixelCanvas ariaLabel="目标图案" pixels={targetPixels()} />
                                  <figcaption>目标图案</figcaption>
                                </figure>
                                <figure>
                                  <Show
                                    fallback={<div class="pixel-compare-empty">?</div>}
                                    when={
                                      consoleData().output.lastRun &&
                                      "pixels" in consoleData().output.lastRun!
                                        ? consoleData().output.lastRun
                                        : null
                                    }
                                  >
                                    {(pixelRun) => (
                                      <PixelCanvas
                                        ariaLabel="你的解码结果"
                                        diffAgainst={targetPixels()}
                                        pixels={
                                          (
                                            pixelRun() as {
                                              pixels: ReturnType<typeof targetPixels>;
                                            }
                                          ).pixels
                                        }
                                      />
                                    )}
                                  </Show>
                                  <figcaption>
                                    你的解码结果
                                    {consoleData().output.pixelDiff !== null
                                      ? ` · ${consoleData().output.pixelDiff} 个像素不同`
                                      : ""}
                                  </figcaption>
                                </figure>
                              </div>
                            )}
                          </Show>
                          <Show
                            when={
                              !consoleData().output.lastRun &&
                              !consoleData().output.runError &&
                              !consoleData().output.preview &&
                              ready().stage.kind !== "bmp"
                            }
                          >
                            <p class="output-empty">运行 decode 后，结果会出现在这里。</p>
                          </Show>
                        </section>
                      </div>
                    )}
                  </Show>
                }
                when={(() => {
                  const payload = ready().payload;
                  return payload.kind === "files" ? payload : null;
                })()}
              >
                {(filesPayload) => (
                  <FilesPanel
                    onVerdict={(fileIndex, verdict, expectDecoder) =>
                      props.actions.setVerdict(fileIndex, verdict, expectDecoder)
                    }
                    payload={filesPayload()}
                    verdicts={props.model.verdicts}
                  />
                )}
              </Show>

              <ConceptPanel
                answered={concepts().answered}
                onAnswer={props.actions.answerPrompt}
                stage={ready().stage}
                wrongPick={concepts().wrongPick}
              />

              <div class="submit-row">
                <Button
                  class="button button-primary"
                  disabled={submission().submitting || submission().blocker !== null}
                  onClick={() => void props.actions.submit()}
                  type="button"
                >
                  {submission().submitting ? "判定中…" : "提交判定"}
                </Button>
                <span class="submit-note">
                  {submission().blocker ?? "提交你还原出的结果，检查是否符合本关要求。"}
                </span>
              </div>

              <Show when={judge()}>
                {(j) => (
                  <section
                    aria-label="判定结果"
                    class={`judge-result${j().outcome.passed ? " is-passed" : ""}`}
                  >
                    <h3>{j().outcome.passed ? "判定通过 ✓" : "判定未通过"}</h3>
                    <Show when={j().outcome.passed && j().nextStageIndex !== null}>
                      <Button
                        class="button button-primary judge-next"
                        onClick={() => props.actions.selectStage(j().nextStageIndex!)}
                        type="button"
                      >
                        前往下一关 →
                      </Button>
                    </Show>
                    <ol>
                      <For each={j().outcome.parts}>
                        {(part) => (
                          <li class={part.ok ? "is-ok" : "is-bad"}>
                            <strong>{part.label}</strong>
                            <span>{part.detail}</span>
                          </li>
                        )}
                      </For>
                    </ol>
                  </section>
                )}
              </Show>
            </>
          )}
        </Show>
      </main>
    </LabPageShell>
  );
}
