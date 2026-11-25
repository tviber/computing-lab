import { useState, type Dispatch } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChoiceQuestion } from "../domain/schema.ts";
import type { EditorAction } from "../lesson/editorActions.ts";
import { blankOption } from "../lesson/editorState.ts";
import { ChoiceEditor } from "./ChoiceEditor.tsx";

const choice = (options: ReturnType<typeof blankOption>[]): ChoiceQuestion => ({
  id: "q1",
  type: "choice",
  prompt: "题干",
  required: true,
  score: 4,
  multiple: false,
  options,
  correctOptionIds: [],
});

function Harness({
  initial,
  onUpdate,
}: {
  initial: ChoiceQuestion;
  onUpdate: (q: ChoiceQuestion) => void;
}) {
  const [q, setQ] = useState(initial);
  const dispatch: Dispatch<EditorAction> = (a) => {
    if (a.type === "update" && a.question.id === q.id && a.question.type === "choice") {
      setQ(a.question);
      onUpdate(a.question);
    }
  };
  return <ChoiceEditor dispatch={dispatch} q={q} />;
}

describe("ChoiceEditor option ids", () => {
  it("toggles multi-select by its label and partial credit with the keyboard", async () => {
    const user = userEvent.setup();
    const updates: ChoiceQuestion[] = [];
    render(
      <Harness
        initial={choice([blankOption(1), blankOption(2)])}
        onUpdate={(q) => updates.push(q)}
      />,
    );
    await user.click(screen.getByText("允许多选"));
    expect(screen.getByRole("checkbox", { name: "允许多选" })).toBeChecked();
    const partial = screen.getByRole("checkbox", { name: "漏选给部分分" });
    await user.tab();
    expect(partial).toHaveFocus();
    await user.keyboard("[Space]");
    expect(updates.at(-1)).toMatchObject({ multiple: true, partialCredit: true });
  });

  it("mints a unique id when an option is added after deleting a middle one", async () => {
    const user = userEvent.setup();
    const updates: ChoiceQuestion[] = [];
    const initial = choice([blankOption(1), blankOption(2), blankOption(3), blankOption(4)]);
    render(<Harness initial={initial} onUpdate={(q) => updates.push(q)} />);

    await user.click(screen.getByLabelText("删除选项 2"));
    await user.click(screen.getByRole("button", { name: "+ 添加选项" }));

    // Old behaviour minted o4 again (options.length + 1); the new row must be o5.
    const last = updates.at(-1);
    expect(last?.options.map((o) => o.id)).toEqual(["o1", "o3", "o4", "o5"]);
    expect(new Set(last?.options.map((o) => o.id)).size).toBe(4);
  });
});
