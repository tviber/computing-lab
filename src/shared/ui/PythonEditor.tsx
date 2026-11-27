import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { createEffect, untrack } from "solid-js";
import "./pythonCode.css";

const PYTHON_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--code-keyword)" },
  { tag: [tags.bool, tags.atom, tags.literal], color: "var(--code-literal)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
  { tag: [tags.number, tags.escape], color: "var(--code-number)" },
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className], color: "var(--code-type)" },
  { tag: tags.definition(tags.variableName), color: "var(--code-definition)", fontWeight: "600" },
  { tag: tags.propertyName, color: "var(--code-definition)" },
  { tag: tags.variableName, color: "var(--code-variable)" },
  { tag: tags.operator, color: "var(--code-operator)" },
  { tag: tags.invalid, color: "var(--danger-ink)", textDecoration: "underline wavy" },
]);

const BASE_EXTENSIONS = [
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  bracketMatching(),
  python(),
  indentUnit.of("    "),
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
  syntaxHighlighting(PYTHON_HIGHLIGHT_STYLE),
];

export function PythonEditor(props: {
  ariaLabel: string;
  ariaDescribedBy?: string;
  className?: string;
  editable?: boolean;
  height?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  let hostEl: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let syncingExternal = false;

  const editableComp = new Compartment();
  const contentAttrsComp = new Compartment();
  const themeComp = new Compartment();

  const buildContentAttrs = (label: string, describedBy: string | undefined) => {
    const attrs: Record<string, string> = { "aria-label": label };
    if (describedBy) attrs["aria-describedby"] = describedBy;
    return EditorView.contentAttributes.of(attrs);
  };

  const buildTheme = (height: string) =>
    EditorView.theme({
      "&": { height, backgroundColor: "#ffffff" },
      ".cm-scroller": { overflow: "auto" },
    });

  createEffect(
    () => 0,
    () => {
      if (!hostEl) return;
      const initial = untrack(() => ({
        value: props.value,
        editable: props.editable ?? true,
        ariaLabel: props.ariaLabel,
        ariaDescribedBy: props.ariaDescribedBy,
        height: props.height ?? "220px",
      }));
      const state = EditorState.create({
        doc: initial.value,
        extensions: [
          ...BASE_EXTENSIONS,
          editableComp.of(EditorView.editable.of(initial.editable)),
          contentAttrsComp.of(buildContentAttrs(initial.ariaLabel, initial.ariaDescribedBy)),
          themeComp.of(buildTheme(initial.height)),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingExternal) return;
            props.onChange(update.state.doc.toString());
          }),
        ],
      });
      view = new EditorView({ state, parent: hostEl });
      return () => {
        view?.destroy();
        view = undefined;
      };
    },
  );

  createEffect(
    () => props.value,
    (next) => {
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === next) return;
      syncingExternal = true;
      try {
        view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
      } finally {
        syncingExternal = false;
      }
    },
  );

  createEffect(
    () => props.editable ?? true,
    (editable) => {
      view?.dispatch({ effects: editableComp.reconfigure(EditorView.editable.of(editable)) });
    },
  );

  createEffect(
    () => [props.ariaLabel, props.ariaDescribedBy] as const,
    ([label, describedBy]) => {
      view?.dispatch({
        effects: contentAttrsComp.reconfigure(buildContentAttrs(label, describedBy)),
      });
    },
  );

  createEffect(
    () => props.height ?? "220px",
    (height) => {
      view?.dispatch({ effects: themeComp.reconfigure(buildTheme(height)) });
    },
  );

  return (
    <div
      class={`python-editor${props.className ? ` ${props.className}` : ""}`}
      ref={(el) => {
        hostEl = el;
      }}
    />
  );
}
