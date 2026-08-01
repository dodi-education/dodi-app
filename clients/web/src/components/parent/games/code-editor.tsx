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
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";

import { createStudioSearchPanel } from "@/components/parent/games/code-search-panel";

/** Imperative handle the viewer uses to reach into the editor (save, copy,
 *  search). */
export interface CodeEditorHandle {
  getCode(): string;
  /** Opens the in-editor search panel (native find-in-page can't see the
   *  virtualized document, so the viewer routes Ctrl+F here). */
  openSearch(): void;
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
  /**
   * Translations for CodeMirror's UI strings (the search panel), keyed by
   * CodeMirror's English defaults (e.g. `"match case"`). Read once when the
   * editor mounts — a locale switch mid-session is ignored on purpose, so a
   * re-rendering parent can pass a fresh object without remounting the view.
   */
  phrases?: Record<string, string>;
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
  // Search panel (custom, VS Code-style — see code-search-panel.ts),
  // restyled to the studio chrome.
  ".cm-panels": {
    backgroundColor: "var(--color-background)",
    color: "var(--color-ink-2)",
    fontFamily: "var(--font-sans)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--color-border)",
  },
  ".cm-panel.cm-search": {
    display: "flex",
    alignItems: "flex-start",
    gap: "4px",
    padding: "6px 10px",
    fontSize: "12px",
  },
  ".cm-search-rows": {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  ".cm-search-row": { display: "flex", alignItems: "center", gap: "4px" },
  ".cm-search-field-wrap": {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "2px 4px",
  },
  ".cm-search-field-wrap:focus-within": {
    borderColor: "var(--color-primary)",
  },
  ".cm-panel.cm-search .cm-textfield": {
    border: "none",
    backgroundColor: "transparent",
    outline: "none",
    padding: "2px 6px",
    width: "190px",
    fontSize: "12px",
  },
  ".cm-search-opt": {
    border: "none",
    backgroundColor: "transparent",
    borderRadius: "4px",
    padding: "1px 5px",
    fontSize: "11px",
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--color-muted-foreground)",
    cursor: "pointer",
  },
  ".cm-search-opt:hover": { backgroundColor: "var(--color-primary-soft)" },
  ".cm-search-opt[aria-pressed=true]": {
    backgroundColor: "var(--color-primary-soft)",
    color: "var(--color-primary)",
  },
  ".cm-search-btn, .cm-search-expand": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: "6px",
    color: "var(--color-muted-foreground)",
    cursor: "pointer",
  },
  ".cm-search-btn:hover, .cm-search-expand:hover": {
    backgroundColor: "var(--color-primary-soft)",
    color: "var(--color-primary)",
  },
  ".cm-search-count": {
    color: "var(--color-faint)",
    whiteSpace: "nowrap",
    padding: "0 4px",
  },
  ".cm-panel.cm-search .cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "2px 10px",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-panel.cm-search .cm-button:hover": {
    backgroundColor: "var(--color-primary-soft)",
  },
});

/**
 * CodeMirror 6 editor for a game's HTML bundle (with embedded CSS/JS
 * grammars). Uncontrolled by design: the view owns the document so typing
 * never round-trips through React state. Both effect deps are stable for the
 * lifetime of an edit session (the viewer freezes `code` and passes a setState
 * as `onReady`), so the view mounts exactly once per session. Search is the
 * in-editor panel (Mod+F inside the editor, or `openSearch()` from outside),
 * since find-in-page can't see the virtualized document.
 */
export function CodeEditor({
  initialCode,
  onReady,
  phrases,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Mount-time snapshot (see the `phrases` prop doc).
  const phrasesRef = useRef(phrases);

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
          search({ top: true, createPanel: createStudioSearchPanel }),
          highlightSelectionMatches(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          editorTheme,
          phrasesRef.current
            ? EditorState.phrases.of(phrasesRef.current)
            : [],
        ],
      }),
    });
    view.focus();
    onReady({
      getCode: () => view.state.doc.toString(),
      openSearch: () => {
        openSearchPanel(view);
      },
    });
    return () => {
      onReady(null);
      view.destroy();
    };
  }, [initialCode, onReady]);

  return <div ref={containerRef} className={className} />;
}
