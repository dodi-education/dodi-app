"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Prism from "prismjs";
// markup first so css/javascript can graft embedded <style>/<script> highlighting
// onto it; clike is javascript's dependency. All four ship in the default build,
// so re-importing them is idempotent (and keeps tokenization SSR-safe — highlight
// is a pure string→HTML pass with no DOM access).
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";

import { Icon } from "@/components/shared/icon";
import { CodeDiffView } from "@/components/parent/games/code-diff-view";
import type { CodeEditorHandle } from "@/components/parent/games/code-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// CodeMirror is edit-only: lazy-load it so the read view ships none of it.
const CodeEditor = dynamic(
  () =>
    import("@/components/parent/games/code-editor").then((m) => m.CodeEditor),
  { ssr: false },
);

/** One entry in the version selector (date preformatted by the parent). */
export interface CodeViewerVersion {
  id: string;
  dateLabel: string;
}

/** Display form of a version id — its first 8 chars. */
function shortVersionId(id: string): string {
  return id.slice(0, 8);
}

interface CodeViewerProps {
  /** The game's HTML bundle (a full document with embedded CSS/JS). */
  code: string;
  /** The previous version's code; enables the "Show changes" diff toggle. */
  previousCode?: string | null;
  /** Diff mode on/off — controlled by the parent (chat links flip it too). */
  showChanges?: boolean;
  /** Renders the "Show changes" toggle in the header when provided. */
  onShowChangesChange?: (next: boolean) => void;
  /** Version history for the selector, newest first. */
  versions?: CodeViewerVersion[];
  /** The version the game's code currently matches (selector value). */
  currentVersionId?: string | null;
  /** Switch the game to a version; renders the selector when provided. */
  onSelectVersion?: (versionId: string) => void;
  /** Disables the selector + Edit while a build/switch is in flight. */
  busy?: boolean;
  /**
   * Manual editing: called with the edited code on save (Save button or
   * Ctrl+S). Resolve true when persisted (exits edit mode) or false to stay
   * in edit mode (cancelled / failed). Renders the Edit button when provided.
   */
  onSaveEdit?: (code: string) => Promise<boolean>;
  /** Filename shown in the editor tab. */
  filename?: string;
  copyLabel: string;
  copiedLabel: string;
  showChangesLabel?: string;
  /** Tooltip on the disabled toggle (no previous version to compare). */
  showChangesUnavailableTitle?: string;
  /** i18n line for a collapsed diff run, e.g. "42 unchanged lines". */
  unchangedLabel?: (count: number) => string;
  editLabel?: string;
  editSaveLabel?: string;
  editCancelLabel?: string;
  versionSelectorLabel?: string;
  /**
   * Translations for the edit-mode search panel, keyed by CodeMirror's
   * English defaults (e.g. `"match case"`). Passed to the editor untouched.
   */
  searchPhrases?: Record<string, string>;
}

/**
 * Syntax-highlighted view of a game's HTML bundle, styled like a modern code
 * editor — a light surface, a filename tab, a line-number gutter, and a copy
 * action. Read-only until the parent unlocks editing (Edit swaps in a
 * lazy-loaded CodeMirror view with matching highlighting, saved via Ctrl+S or
 * the Save button). Token colors live in `globals.css` (scoped under
 * `.dodi-code`).
 */
export function CodeViewer({
  code,
  previousCode,
  showChanges = false,
  onShowChangesChange,
  versions,
  currentVersionId,
  onSelectVersion,
  busy = false,
  onSaveEdit,
  filename = "index.html",
  copyLabel,
  copiedLabel,
  showChangesLabel,
  showChangesUnavailableTitle,
  unchangedLabel,
  editLabel,
  editSaveLabel,
  editCancelLabel,
  versionSelectorLabel,
  searchPhrases,
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual-edit mode: CodeMirror owns the draft (no re-render per keystroke);
  // the handle pulls the text out on save/copy. Null until the lazy chunk
  // loads and the view mounts — Save stays disabled meanwhile. `editSeed`
  // freezes the code at edit-start so a chat build landing mid-edit can't
  // remount the editor and wipe the typed draft.
  const [editing, setEditing] = useState(false);
  const [editSeed, setEditSeed] = useState("");
  const [editorHandle, setEditorHandle] = useState<CodeEditorHandle | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Diffable once a previous version exists and actually differs.
  const canDiff = Boolean(previousCode) && previousCode !== code;
  const diffActive = showChanges && canDiff && !editing;

  const currentVersion =
    versions?.find((v) => v.id === currentVersionId) ?? null;

  const html = useMemo(
    () => Prism.highlight(code, Prism.languages.markup, "markup"),
    [code],
  );
  const lineCount = useMemo(() => code.split("\n").length, [code]);

  // Clear the "Copied" timeout if the viewer unmounts mid-feedback.
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        editing ? (editorHandle?.getCode() ?? code) : code,
      );
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context / denied) — no-op */
    }
  };

  const startEdit = (): void => {
    setEditSeed(code);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
  };

  const saveEdit = useCallback(async (): Promise<void> => {
    if (!onSaveEdit || savingRef.current) return;
    const edited = editorHandle?.getCode();
    if (edited === undefined) return; // editor chunk still loading
    // Nothing typed — just lock the editor again, no save round-trip.
    if (edited === editSeed) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await onSaveEdit(edited);
      if (saved) {
        setEditing(false);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onSaveEdit, editorHandle, editSeed]);

  // Editing shortcuts, window-level so focus doesn't matter: Ctrl/Cmd+S
  // saves; Ctrl/Cmd+F opens the editor's search panel, because native
  // find-in-page only sees CodeMirror's rendered viewport, not the document.
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveEdit();
      } else if (key === "f" && !e.shiftKey && !e.altKey) {
        // Already handled (focus was inside the editor, whose own keymap
        // binds Mod+F) — nothing left to do.
        if (e.defaultPrevented || !editorHandle) return;
        // Keep native find for other editable surfaces (e.g. the chat box).
        const target = e.target;
        if (
          target instanceof HTMLElement &&
          !target.closest(".cm-editor") &&
          (target.isContentEditable ||
            target.closest("input, textarea, select"))
        )
          return;
        e.preventDefault();
        editorHandle.openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, saveEdit, editorHandle]);

  const headerButton = (
    active: boolean,
    disabled: boolean,
  ): string =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] font-semibold transition-colors",
      active
        ? "bg-primary-soft text-primary"
        : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
      disabled &&
        "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
    );

  return (
    <div
      className={cn(
        "dodi-code flex min-h-full flex-col bg-card font-mono text-[12.5px] leading-[1.75] text-ink-2",
        // Edit mode locks the viewer to the pane's height so CodeMirror is
        // bounded and scrolls internally. Left unbounded (the read view's
        // pane-scrolling layout), the editor grows to document height and a
        // find jump scrolls the pane, carrying the top-docked search panel
        // out of view.
        editing && "h-full",
      )}
    >
      {/* Editor chrome — filename tab + version/edit/diff/copy actions */}
      <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 font-sans text-[12px] font-medium text-muted-foreground">
          <Icon name="code" size={14} className="text-faint" />
          <span className="truncate">{filename}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void copy()}
            className={headerButton(false, false)}
          >
            <Icon
              name={copied ? "check" : "copy"}
              size={14}
              className={copied ? "text-success" : undefined}
            />
            {copied ? copiedLabel : copyLabel}
          </button>
          {onSaveEdit && !editing && (
            <button
              type="button"
              onClick={startEdit}
              disabled={busy}
              className={headerButton(false, busy)}
            >
              <Icon name="edit" size={14} />
              {editLabel}
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saving || !editorHandle}
                className={headerButton(true, saving || !editorHandle)}
              >
                <Icon name="check" size={14} />
                {editSaveLabel}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className={headerButton(false, saving)}
              >
                <Icon name="close" size={14} />
                {editCancelLabel}
              </button>
            </>
          )}
          {!editing && onShowChangesChange && (
            <button
              type="button"
              onClick={() => onShowChangesChange(!showChanges)}
              disabled={!canDiff}
              aria-pressed={diffActive}
              title={canDiff ? undefined : showChangesUnavailableTitle}
              className={headerButton(diffActive, !canDiff)}
            >
              <Icon name="diff" size={14} />
              {showChangesLabel}
            </button>
          )}
          {!editing && onSelectVersion && versions && versions.length > 0 && (
            <Select
              value={currentVersionId ?? undefined}
              onValueChange={onSelectVersion}
              disabled={busy}
            >
              <SelectTrigger
                size="sm"
                aria-label={versionSelectorLabel}
                className="h-7 gap-1.5 border-transparent bg-transparent px-2 py-0 font-sans text-[12px] font-semibold text-muted-foreground shadow-none hover:border-transparent hover:bg-primary-soft hover:text-primary"
              >
                <Icon name="history" size={14} />
                {/* Custom value: the short id always; the date only on md+ so
                    the mobile header stays narrow (the list keeps both). */}
                <SelectValue aria-label={versionSelectorLabel}>
                  {currentVersion && (
                    <span className="font-mono">
                      {shortVersionId(currentVersion.id)}
                      <span className="hidden md:inline">
                        {" · "}
                        {currentVersion.dateLabel}
                      </span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" position="popper">
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="font-mono text-[12px]">
                    {shortVersionId(v.id)}
                    {" · "}
                    {v.dateLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Code body — a sticky line-number gutter beside horizontally-scrolling code.
          Gutter and <pre> share font size + line-height so the numbers stay aligned.
          min-w-0 lets this scroll horizontally instead of widening the studio pane
          (which would otherwise squeeze the Dodi sidebar). */}
      {editing ? (
        /* CodeMirror brings its own gutter and scroller; `min-h-0 flex-1`
           bounds it so the editor scrolls internally instead of growing the
           pane. */
        <CodeEditor
          initialCode={editSeed}
          onReady={setEditorHandle}
          phrases={searchPhrases}
          className="min-h-0 flex-1 overflow-hidden"
        />
      ) : diffActive && previousCode ? (
        <CodeDiffView
          previousCode={previousCode}
          code={code}
          unchangedLabel={unchangedLabel ?? ((count) => `${count}`)}
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
          <div
            aria-hidden
            className="sticky left-0 z-[1] flex-shrink-0 select-none border-r border-border bg-card py-4 pl-4 pr-3 text-right text-faint"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="w-max py-4 pl-4 pr-8">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
      )}
    </div>
  );
}
