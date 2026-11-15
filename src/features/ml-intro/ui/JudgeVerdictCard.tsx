import { Icon } from "../../../shared/ui/Icon.tsx";
import type { MlTestSummary } from "../domain/protocol.ts";

/** Renders the authoritative server verdict and part-by-part check status. */
export function JudgeVerdictCard({
  summary,
  passed,
  hasNextStage,
  onNextStage,
}: {
  summary: MlTestSummary | null;
  passed: boolean;
  hasNextStage: boolean;
  onNextStage?: () => void;
}) {
  if (!summary) return null;

  return (
    <section
      aria-live="polite"
      className={`ml-verdict ${passed ? "is-pass" : "is-fail"}`}
      role="status"
    >
      <div className="ml-verdict-head">
        <strong className="ml-verdict-title">
          <Icon name={passed ? "check" : "warning"} size={15} />
          {passed ? "通过本关判定" : "尚未通过本关"}
        </strong>
        {passed && hasNextStage && onNextStage ? (
          <button className="button button-primary" onClick={onNextStage} type="button">
            进入下一关 <Icon name="arrow-right" size={14} />
          </button>
        ) : null}
      </div>
      <p className="ml-verdict-detail">{summary.detail}</p>
      <ul className="ml-verdict-parts">
        {summary.parts.map((part) => (
          <li className={part.ok ? "is-ok" : "is-bad"} key={part.id}>
            <span className="ml-part-label">
              <Icon name={part.ok ? "check" : "x"} size={12} />
              {part.label}
            </span>
            {part.detail ? <span className="ml-part-detail">{part.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
