import { useState } from "react";
import { findTrainingExamplesForWord, type WordWeightEntry } from "../domain/logisticRegression.ts";

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
    <section className="logistic-regression-panel logistic-regression-spectrum">
      <div className="logistic-regression-panel-head">
        <h3>{heading}</h3>
        <span className="logistic-regression-muted-note">
          点击任意词语，查看训练集里包含它的真实短信
        </span>
      </div>

      {topSpam.length === 0 && topHam.length === 0 ? (
        <p className="logistic-regression-muted-note">
          第 0 轮是训练前的权重，各个词都是 0。拖动回放滑块可以查看已经计算好的后续轮次。
        </p>
      ) : (
        <div className="logistic-regression-spectrum-cols">
          <div>
            <p className="logistic-regression-col-title is-danger">
              正权重较大的词（提高垃圾概率）
            </p>
            <ul className="logistic-regression-weight-list">
              {topSpam.map((item) => (
                <li key={`spam-${item.word}`}>
                  <button
                    className={`logistic-regression-weight-btn${activeWord === item.word ? " is-selected" : ""}`}
                    onClick={() => setSelectedWord(item.word)}
                    type="button"
                  >
                    <span className="logistic-regression-weight-word">{item.word}</span>
                    <span className="logistic-regression-weight-bar-track">
                      <span
                        className="logistic-regression-weight-bar is-pos"
                        style={{ width: `${(item.weight / maxAbs) * 100}%` }}
                      />
                    </span>
                    <span className="logistic-regression-mono logistic-regression-weight-num is-pos">
                      +{item.weight.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="logistic-regression-col-title is-success">
              负权重较大的词（降低垃圾概率）
            </p>
            <ul className="logistic-regression-weight-list">
              {topHam.map((item) => (
                <li key={`ham-${item.word}`}>
                  <button
                    className={`logistic-regression-weight-btn${activeWord === item.word ? " is-selected" : ""}`}
                    onClick={() => setSelectedWord(item.word)}
                    type="button"
                  >
                    <span className="logistic-regression-weight-word">{item.word}</span>
                    <span className="logistic-regression-weight-bar-track">
                      <span
                        className="logistic-regression-weight-bar is-neg"
                        style={{ width: `${(Math.abs(item.weight) / maxAbs) * 100}%` }}
                      />
                    </span>
                    <span className="logistic-regression-mono logistic-regression-weight-num is-neg">
                      {item.weight.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeWord && examples.length > 0 ? (
        <div className="logistic-regression-word-examples">
          <p className="logistic-regression-subhead">
            训练集中包含「<strong>{activeWord}</strong>」的短信：
          </p>
          <ul>
            {examples.map((ex, i) => (
              <li key={i}>
                <span
                  className={`logistic-regression-pill ${ex.label === 1 ? "is-danger" : "is-success"}`}
                >
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
