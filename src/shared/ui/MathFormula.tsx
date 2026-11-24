import { renderToString } from "katex";
import { memo } from "react";
import "katex/dist/katex.min.css";
import "./mathFormula.css";

export const MathFormula = memo(function MathFormula({
  children,
  display = false,
}: {
  children: string;
  display?: boolean;
}) {
  const html = renderToString(children, {
    displayMode: display,
    output: "htmlAndMathml",
    fleqn: display,
    trust: false,
    throwOnError: false,
  });
  return (
    <span
      className={display ? "math-formula-block" : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/** Inline $TeX$ in authored lesson prose. */
export function MathText({ children }: { children: string }) {
  return children
    .split(/\$([^$\n]+)\$/g)
    .map((part, i) => (i % 2 === 1 ? <MathFormula key={i}>{part}</MathFormula> : part));
}
