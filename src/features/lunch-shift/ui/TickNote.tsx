/**
 * What is "1 拍"? A tiny animated explainer — six cells lighting up in
 * sequence so the unit of the simulation clock is visible, not jargon.
 */

export function TickNote() {
  return (
    <p className="lunch-ticknote">
      <span aria-hidden="true" className="lunch-ticknote-cells">
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} style={{ animationDelay: `${index * 0.42}s` }} />
        ))}
      </span>
      1 拍 = 系统时钟走一格。三站在同一拍里各做一件事，一轮共 30 拍。
    </p>
  );
}
