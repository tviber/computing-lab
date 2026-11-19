import { Icon } from "../../../shared/ui/Icon.tsx";
import type { LogisticRegressionTestSummary } from "../domain/protocol.ts";

export function JudgeVerdictCard({
  summary,
  passed,
  hasNextStage,
  onNextStage,
}: {
  summary: LogisticRegressionTestSummary | null;
  passed: boolean;
  hasNextStage: boolean;
  onNextStage?: () => void;
}) {
  if (!summary) return null;

  return (
    <section
      aria-live="polite"
      className={`logistic-regression-verdict ${passed ? "is-pass" : "is-fail"}`}
      role="status"
    >
      <div className="logistic-regression-verdict-head">
        <strong className="logistic-regression-verdict-title">
          <Icon name={passed ? "check" : "warning"} size={15} />
          {passed ? "通过本关判定" : "尚未通过本关"}
        </strong>
        {passed && hasNextStage && onNextStage ? (
          <button className="button button-primary" onClick={onNextStage} type="button">
            进入下一关 <Icon name="arrow-right" size={14} />
          </button>
        ) : null}
      </div>
      <p className="logistic-regression-verdict-detail">{summary.detail}</p>
      <ul className="logistic-regression-verdict-parts">
        {summary.parts.map((part) => (
          <li className={part.ok ? "is-ok" : "is-bad"} key={part.id}>
            <span className="logistic-regression-part-label">
              <Icon name={part.ok ? "check" : "x"} size={12} />
              {part.label}
            </span>
            {part.detail ? (
              <span className="logistic-regression-part-detail">{part.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
