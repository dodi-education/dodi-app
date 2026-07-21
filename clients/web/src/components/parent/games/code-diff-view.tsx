"use client";

import { useMemo, useState } from "react";

import {
  buildDiffLines,
  collapseUnchanged,
  type DiffLine,
} from "@/components/parent/games/code-diff";
import { cn } from "@/lib/utils";

interface CodeDiffViewProps {
  /** The stored pre-change version (left side of the diff). */
  previousCode: string;
  /** The current code (right side of the diff). */
  code: string;
  /** i18n line for a collapsed run, e.g. "42 unchanged lines". */
  unchangedLabel: (count: number) => string;
}

type Entry =
  | { type: "line"; line: DiffLine }
  | { type: "skip"; sectionIndex: number; count: number };

const ROW_TINT: Record<DiffLine["kind"], string | undefined> = {
  added: "bg-success-soft",
  removed: "bg-danger-soft",
  context: undefined,
};

/**
 * Unified line diff between the previous and current game bundle, rendered as
 * plain (un-highlighted) monospace text: line numbers for both versions, green
 * added / red removed rows, and long unchanged runs collapsed behind an
 * expandable "⋯ N unchanged lines" row. Shares the CodeViewer's editor styling
 * (font, gutter, horizontal scroll).
 */
export function CodeDiffView({ previousCode, code, unchangedLabel }: CodeDiffViewProps) {
  const sections = useMemo(
    () => collapseUnchanged(buildDiffLines(previousCode, code)),
    [previousCode, code],
  );
  // Indices of collapsed sections the user opened, keyed by position within
  // `sections`. A new diff produces a new `sections` identity — drop the stale
  // indices with it (adjust-state-during-render, per the React docs).
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState(sections);
  if (expandedSections !== sections) {
    setExpandedSections(sections);
    setExpanded(new Set());
  }

  const entries = useMemo(() => {
    const list: Entry[] = [];
    sections.forEach((section, sectionIndex) => {
      if (section.isCollapsed && !expanded.has(sectionIndex)) {
        list.push({ type: "skip", sectionIndex, count: section.lines.length });
      } else {
        for (const line of section.lines) list.push({ type: "line", line });
      }
    });
    return list;
  }, [sections, expanded]);

  // Width of one line-number column, in ch, from the larger version's line count.
  const numWidth = useMemo(() => {
    let maxNo = 1;
    for (const s of sections) {
      for (const l of s.lines) maxNo = Math.max(maxNo, l.oldNo ?? 0, l.newNo ?? 0);
    }
    return `${String(maxNo).length}ch`;
  }, [sections]);

  const expand = (sectionIndex: number): void => {
    setExpanded((prev) => new Set(prev).add(sectionIndex));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
      {/* Double gutter — previous | current line numbers, tinted like their rows. */}
      <div
        aria-hidden
        className="sticky left-0 z-[1] flex-shrink-0 select-none border-r border-border bg-card py-4 text-right text-faint"
      >
        {entries.map((entry, i) =>
          entry.type === "skip" ? (
            <div key={i} className="px-3 text-center">
              ⋯
            </div>
          ) : (
            <div key={i} className={cn("flex gap-2 pl-4 pr-3", ROW_TINT[entry.line.kind])}>
              <span className="inline-block" style={{ width: numWidth }}>
                {entry.line.oldNo ?? ""}
              </span>
              <span className="inline-block" style={{ width: numWidth }}>
                {entry.line.newNo ?? ""}
              </span>
            </div>
          ),
        )}
      </div>

      {/* Diff body — +/− marker and the line, full-width row tint, horizontal scroll. */}
      <div className="w-max py-4 pr-8">
        {entries.map((entry, i) =>
          entry.type === "skip" ? (
            <button
              key={i}
              type="button"
              onClick={() => expand(entry.sectionIndex)}
              className="block w-full whitespace-pre pl-2 text-left font-sans text-[12px] font-medium text-faint transition-colors hover:text-primary"
            >
              {`⋯ ${unchangedLabel(entry.count)}`}
            </button>
          ) : (
            <div key={i} className={cn("whitespace-pre", ROW_TINT[entry.line.kind])}>
              <span
                className={cn(
                  "inline-block w-6 select-none text-center font-bold",
                  entry.line.kind === "added" && "text-success",
                  entry.line.kind === "removed" && "text-danger",
                )}
              >
                {entry.line.kind === "added" ? "+" : entry.line.kind === "removed" ? "−" : " "}
              </span>
              {entry.line.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
