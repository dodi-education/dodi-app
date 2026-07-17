"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface CodeViewerProps {
  /** The game's HTML bundle (a full document with embedded CSS/JS). */
  code: string;
  /** Filename shown in the editor tab. */
  filename?: string;
  copyLabel: string;
  copiedLabel: string;
}

/**
 * Read-only, syntax-highlighted view of a game's HTML bundle, styled like a
 * modern code editor — a light surface, a filename tab, a line-number gutter,
 * and a copy action. Games are AI-generated and sandboxed, so this is a viewer,
 * not an editor. Token colors live in `globals.css` (scoped under `.dodi-code`).
 */
export function CodeViewer({
  code,
  filename = "index.html",
  copyLabel,
  copiedLabel,
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context / denied) — no-op */
    }
  };

  return (
    <div className="dodi-code flex min-h-full flex-col bg-card font-mono text-[12.5px] leading-[1.75] text-ink-2">
      {/* Editor chrome — filename tab + copy action */}
      <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2 font-sans text-[12px] font-medium text-muted-foreground">
          <Icon name="code" size={14} className="text-faint" />
          <span>{filename}</span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
        >
          <Icon
            name={copied ? "check" : "copy"}
            size={14}
            className={copied ? "text-success" : undefined}
          />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>

      {/* Code body — a sticky line-number gutter beside horizontally-scrolling code.
          Gutter and <pre> share font size + line-height so the numbers stay aligned.
          min-w-0 lets this scroll horizontally instead of widening the studio pane
          (which would otherwise squeeze the Dodi sidebar). */}
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
    </div>
  );
}
