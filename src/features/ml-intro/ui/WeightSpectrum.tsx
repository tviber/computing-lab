import { useState } from "react";
import { findTrainingExamplesForWord, type WordWeightEntry } from "../domain/logreg.ts";

/**
 * Side-by-side Top Ham (-w) vs Top Spam (+w) feature bar chart with
 * click-to-inspect training SMS evidence so learners can audit what cues
 * the classifier actually picked up.
 */
export function WeightSpectrum({
  topSpam,
  topHam,
  trainCount,
  heading = "哪些词的权重较大",
}: {
  topSpam: readonly WordWeightEntry[];
  topHam: readonly WordWeightEntry[];
  trainCount: number;
  heading?: string;
}) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const maxAbs = Math.max(
    0.5,
    ...topSpam.map((w) => Math.abs(w.weight)),
    ...topHam.map((w) => Math.abs(w.weight)),
  );

  const activeWord =
    selectedWord &&
    (topSpam.some((w) => w.word === selectedWord) || topHam.some((w) => w.word === selectedWord))
      ? selectedWord
      : (topSpam[0]?.word ?? topHam[0]?.word ?? null);

  const examples = activeWord ? findTrainingExamplesForWord(activeWord, trainCount, 3) : [];

  return (
    <section className="ml-panel ml-spectrum">
      <div className="ml-panel-head">
        <h3>{heading}</h3>
        <span className="ml-muted-note">点击任意词语，查看训练集里包含它的真实短信</span>
      </div>

      {topSpam.length === 0 && topHam.length === 0 ? (
        <p className="ml-muted-note">
          第 0 轮是训练前的权重，各个词都是 0。拖动回放滑块可以查看已经计算好的后续轮次。
        </p>
      ) : (
        <div className="ml-spectrum-cols">
          <div>
            <p className="ml-col-title is-danger">正权重较大的词（提高垃圾概率）</p>
            <ul className="ml-weight-list">
              {topSpam.map((item) => (
                <li key={`spam-${item.word}`}>
                  <button
                    className={`ml-weight-btn${activeWord === item.word ? " is-selected" : ""}`}
                    onClick={() => setSelectedWord(item.word)}
                    type="button"
                  >
                    <span className="ml-weight-word">{item.word}</span>
                    <span className="ml-weight-bar-track">
                      <span
                        className="ml-weight-bar is-pos"
                        style={{ width: `${(item.weight / maxAbs) * 100}%` }}
                      />
                    </span>
                    <span className="ml-mono ml-weight-num is-pos">+{item.weight.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="ml-col-title is-success">负权重较大的词（降低垃圾概率）</p>
            <ul className="ml-weight-list">
              {topHam.map((item) => (
                <li key={`ham-${item.word}`}>
                  <button
                    className={`ml-weight-btn${activeWord === item.word ? " is-selected" : ""}`}
                    onClick={() => setSelectedWord(item.word)}
                    type="button"
                  >
                    <span className="ml-weight-word">{item.word}</span>
                    <span className="ml-weight-bar-track">
                      <span
                        className="ml-weight-bar is-neg"
                        style={{ width: `${(Math.abs(item.weight) / maxAbs) * 100}%` }}
                      />
                    </span>
                    <span className="ml-mono ml-weight-num is-neg">{item.weight.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeWord && examples.length > 0 ? (
        <div className="ml-word-examples">
          <p className="ml-subhead">
            训练集中包含「<strong>{activeWord}</strong>」的短信：
          </p>
          <ul>
            {examples.map((ex, i) => (
              <li key={i}>
                <span className={`ml-pill ${ex.label === 1 ? "is-danger" : "is-success"}`}>
                  {ex.label === 1 ? "垃圾" : "正常"}
                </span>
                <span>{ex.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
