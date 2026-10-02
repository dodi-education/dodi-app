"use client";

import { useMemo, useState } from "react";

import {
  buildDiffLines,
  collapseUnchanged,
  type DiffLine,
} from "@dodi/studio/code-diff";
import { cn } from "@/lib/utils";
import { codeDiff, codeViewer } from "@dodi/ui-recipes";

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
  added: codeDiff.added,
  removed: codeDiff.removed,
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
    <div className={cn(codeViewer.webBody, codeViewer.body)}>
      {/* Double gutter — previous | current line numbers, tinted like their rows. */}
      <div
        aria-hidden
        className={cn(codeDiff.gutter, codeViewer.gutterText, codeViewer.webGutter)}
      >
        {entries.map((entry, i) =>
          entry.type === "skip" ? (
            <div key={i} className={codeDiff.skipNumber}>
              ⋯
            </div>
          ) : (
            <div key={i} className={cn(codeDiff.webNumbers, codeDiff.numbers, ROW_TINT[entry.line.kind])}>
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
      <div className={cn(codeDiff.body, codeDiff.webBody)}>
        {entries.map((entry, i) =>
          entry.type === "skip" ? (
            <button
              key={i}
              type="button"
              onClick={() => expand(entry.sectionIndex)}
              className={cn(codeDiff.skip, codeDiff.skipText, codeDiff.webSkip)}
            >
              {`⋯ ${unchangedLabel(entry.count)}`}
            </button>
          ) : (
            <div key={i} className={cn(codeDiff.webLine, ROW_TINT[entry.line.kind])}>
              <span
                className={cn(
                  codeDiff.marker,
                  codeDiff.webMarker,
                  entry.line.kind === "added" && codeDiff.addedMarker,
                  entry.line.kind === "removed" && codeDiff.removedMarker,
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
