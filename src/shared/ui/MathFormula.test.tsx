import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { MathFormula, MathText } from "./MathFormula";
import { publicCasesFor } from "../../features/calculator/lesson/publicCases";
import { CALCULATOR_STAGES } from "../../features/calculator/domain/stages";
import { IMAGE_SAMPLING_STAGES } from "../../features/image-sampling/domain/stages";
import { LOGISTIC_REGRESSION_STAGES } from "../../features/logistic-regression/domain/stages";
import { STATS_FOUNDATIONS_STAGES } from "../../features/stats-foundations/domain/stages";
import { AnnotatedMathText } from "../../features/calculator/ui/CalculatorTerms";
import { SubmissionFeedback } from "../../features/stats-foundations/ui/SubmissionFeedback";
import { ConceptQuestion } from "../../features/stats-foundations/ui/ConceptQuestion";

function authoredStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(authoredStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(authoredStrings);
  return [];
}

describe("explicit classroom math", () => {
  it("renders every marked course formula with MathML and no invalid or leftover delimiters", () => {
    const prose = authoredStrings([
      STATS_FOUNDATIONS_STAGES,
      LOGISTIC_REGRESSION_STAGES,
      CALCULATOR_STAGES,
      CALCULATOR_STAGES.flatMap((stage) => publicCasesFor(stage.index)),
      IMAGE_SAMPLING_STAGES,
    ]).filter((text) => text.includes("$"));
    expect(prose.length).toBeGreaterThan(50);
    for (const text of prose) {
      const view = render(() => <MathText>{text}</MathText>);
      expect(view.container.querySelector(".katex-error"), text).toBeNull();
      expect(view.container.querySelector("math"), text).not.toBeNull();
      expect(view.container.textContent, text).not.toContain("$");
      view.unmount();
    }
  });

  it("reactively updates values and preserves normal dimensions, data, and escaped HTML", () => {
    const [p, setP] = createSignal(0.7);
    const view = render(() => (
      <p>
        <MathText>{`64×64 · 01001000 · RGB(1,2,3) · <img src=x> $L(${p()})=${p()}^7$`}</MathText>
      </p>
    ));
    expect(view.container.querySelectorAll("math")).toHaveLength(1);
    expect(view.container.querySelector("annotation")).toHaveTextContent("L(0.7)=0.7^7");
    expect(view.container).toHaveTextContent("64×64 · 01001000 · RGB(1,2,3) · <img src=x>");
    expect(view.container.querySelector("img")).toBeNull();
    setP(0.6);
    flush();
    expect(view.container.querySelector("annotation")).toHaveTextContent("L(0.6)=0.6^7");
  });

  it("fails softly on invalid TeX and refuses trusted HTML/URL commands", () => {
    const view = render(() => (
      <>
        <MathFormula>{String.raw`\frac{`}</MathFormula>
        <MathFormula>{String.raw`\href{javascript:alert(1)}{click}`}</MathFormula>
        <MathFormula>{String.raw`\htmlClass{injected}{x}`}</MathFormula>
      </>
    ));
    expect(view.container.querySelector(".katex-error")).not.toBeNull();
    expect(view.container.querySelector("a, .injected, script")).toBeNull();
  });

  it("does not let calculator term annotations split a TeX expression", () => {
    const view = render(() => (
      <AnnotatedMathText text={String.raw`HalfAdder：$A+B=2\mathrm{Carry}+\mathrm{Sum}$`} />
    ));
    expect(view.container.querySelector("abbr")).toHaveTextContent("HalfAdder");
    expect(view.container.querySelectorAll("math")).toHaveLength(1);
    expect(view.container.querySelector(".katex-error")).toBeNull();
  });

  it("renders the likelihood prompt, wrong-answer note, and correct reveal", () => {
    const question = STATS_FOUNDATIONS_STAGES[2].question!;
    const view = render(() => {
      const [answer, setAnswer] = createSignal<number | null>(null);
      return <ConceptQuestion answer={answer()} onAnswer={setAnswer} question={question} />;
    });
    expect(view.container.querySelectorAll(".concept-checklist-prompt math")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /所有概率都会变成/ }));
    flush();
    expect(view.container.querySelector(".concept-checklist-note math")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /取对数能把/ }));
    flush();
    expect(view.container.querySelectorAll(".concept-checklist-reveal math")).toHaveLength(2);
    expect(view.container.textContent).not.toContain("$");
  });

  it("keeps student answers literal in teacher feedback, even with TeX delimiters", () => {
    const summary = String.raw`P(R)=$x^2$, P(R|F)=\href{x}{x}, P(F|R)=?`;
    const view = render(() => (
      <SubmissionFeedback detail={`请核对 $P(A\\mid B)$。（${summary}）`} summary={summary} />
    ));
    expect(view.container.querySelectorAll("math")).toHaveLength(1);
    expect(view.container).toHaveTextContent(summary);
    expect(view.container.querySelector("annotation")).not.toHaveTextContent("x^2");
    expect(view.container.querySelector("a")).toBeNull();
  });

  it("prefers structured feedback and keeps the separately stored answer literal", () => {
    const summary = String.raw`$P(\text{真下雨})$ <img src=x>`;
    const view = render(() => (
      <SubmissionFeedback
        detail="outdated combined text"
        summary="outdated summary"
        feedback={String.raw`请核对 $P(\text{真下雨})$。`}
        answerSummary={summary}
      />
    ));
    expect(view.container.querySelectorAll("math")).toHaveLength(1);
    expect(view.container).toHaveTextContent(summary);
    expect(view.container).not.toHaveTextContent("outdated");
    expect(view.container.querySelector("img")).toBeNull();
  });

  it.each(["", "historical summary with changed formatting"])(
    "keeps legacy feedback readable without an exact summary suffix: %s",
    (summary) => {
      const view = render(() => (
        <SubmissionFeedback
          detail={String.raw`请核对 $P(\text{真下雨})$、$P(\text{真下雨}\mid\text{预报下雨})$。答案：$x^2$`}
          summary={summary}
        />
      ));
      expect(view.container).toHaveTextContent(
        "请核对 P(真下雨)、P(真下雨 | 预报下雨)。答案：$x^2$",
      );
      expect(view.container.querySelector("math")).toBeNull();
    },
  );
});
