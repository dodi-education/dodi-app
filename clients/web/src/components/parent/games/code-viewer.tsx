"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
}

/**
 * Syntax-highlighted view of a game's HTML bundle, styled like a modern code
 * editor — a light surface, a filename tab, a line-number gutter, and a copy
 * action. Read-only until the parent unlocks editing (Edit → plain textarea,
 * saved via Ctrl+S or the Save button). Token colors live in `globals.css`
 * (scoped under `.dodi-code`).
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
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual-edit mode: the draft lives here; the parent only sees it on save.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
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
      await navigator.clipboard.writeText(editing ? draft : code);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context / denied) — no-op */
    }
  };

  const startEdit = (): void => {
    setDraft(code);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setDraft("");
  };

  const saveEdit = useCallback(async (): Promise<void> => {
    if (!onSaveEdit || savingRef.current) return;
    // Nothing changed — just lock the editor again, no save round-trip.
    if (draft === code) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await onSaveEdit(draft);
      if (saved) {
        setEditing(false);
        setDraft("");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onSaveEdit, draft, code]);

  // Ctrl+S / Cmd+S saves while editing (window-level so focus doesn't matter).
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, saveEdit]);

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
    <div className="dodi-code flex min-h-full flex-col bg-card font-mono text-[12.5px] leading-[1.75] text-ink-2">
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
                disabled={saving}
                className={headerButton(true, saving)}
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
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          autoFocus
          className="min-h-0 w-full flex-1 resize-none bg-card p-4 font-mono text-[12.5px] leading-[1.75] text-ink-2 outline-none"
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
