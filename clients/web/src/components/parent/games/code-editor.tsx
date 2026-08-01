"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  syntaxHighlighting,
} from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";

/** Imperative handle the viewer uses to pull the draft out (save, copy). */
export interface CodeEditorHandle {
  getCode(): string;
}

interface CodeEditorProps {
  /** The document the editor opens with; CodeMirror owns it after mount. */
  initialCode: string;
  /**
   * Receives the handle once the view is mounted, and null on unmount.
   * Keystrokes stay inside CodeMirror — React only sees the document again
   * when the parent calls `getCode()`.
   */
  onReady: (handle: CodeEditorHandle | null) => void;
  className?: string;
}

// Mirrors the read view's Prism palette (`.dodi-code .token…` in globals.css)
// so toggling Edit keeps the same colors. Lezer tags are hierarchical — a rule
// for a parent tag (e.g. punctuation) also covers its subtags (brackets).
const editorHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#8a94a4", fontStyle: "italic" },
  { tag: [tags.documentMeta, tags.processingInstruction], color: "#8a94a4" },
  { tag: tags.punctuation, color: "#6b7787" },
  { tag: tags.tagName, color: "#1f883d" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.propertyName],
    color: "#0550ae",
  },
  { tag: [tags.string, tags.attributeValue], color: "#0a3069" },
  {
    tag: [
      tags.attributeName,
      tags.className,
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
    ],
    color: "#8250df",
  },
  { tag: [tags.keyword, tags.operator, tags.regexp], color: "#cf222e" },
]);

// Chrome matching the read view: card surface, faint right-bordered gutter,
// the `.dodi-code` root font (inherited), and the read <pre>'s padding.
const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--color-card)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--color-ink-2)" },
  ".cm-line": { padding: "0 32px 0 16px" },
  ".cm-gutters": {
    backgroundColor: "var(--color-card)",
    color: "var(--color-faint)",
    border: "none",
    borderRight: "1px solid var(--color-border)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
});

/**
 * CodeMirror 6 editor for a game's HTML bundle (with embedded CSS/JS
 * grammars). Uncontrolled by design: the view owns the document so typing
 * never round-trips through React state. Both effect deps are stable for the
 * lifetime of an edit session (the viewer freezes `code` and passes a setState
 * as `onReady`), so the view mounts exactly once per session.
 */
export function CodeEditor({
  initialCode,
  onReady,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          html(),
          syntaxHighlighting(editorHighlight),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          editorTheme,
        ],
      }),
    });
    view.focus();
    onReady({ getCode: () => view.state.doc.toString() });
    return () => {
      onReady(null);
      view.destroy();
    };
  }, [initialCode, onReady]);

  return <div ref={containerRef} className={className} />;
}
