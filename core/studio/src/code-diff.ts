import { diffLines } from "diff";

export interface DiffLine {
  kind: "context" | "added" | "removed";
  text: string;
  /** 1-based line number in the previous version (null for added lines). */
  oldNo: number | null;
  /** 1-based line number in the current version (null for removed lines). */
  newNo: number | null;
}

export interface DiffSection {
  /** Collapsed unchanged run — rendered as an expandable "N unchanged lines" row. */
  isCollapsed: boolean;
  lines: DiffLine[];
}

/** Unchanged lines kept visible on each side of a change. */
const CONTEXT_LINES = 3;
/** Unchanged runs hiding fewer lines than this stay expanded (a "⋯" row would cost more than it saves). */
const MIN_COLLAPSED_LINES = 10;

/** Line-by-line diff of two versions, numbered on both sides. */
export function buildDiffLines(previous: string, current: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const part of diffLines(previous, current)) {
    const texts = part.value.split("\n");
    // A trailing newline yields a dangling empty segment — not a real line.
    if (texts[texts.length - 1] === "") texts.pop();
    for (const text of texts) {
      if (part.added) {
        lines.push({ kind: "added", text, oldNo: null, newNo: newNo++ });
      } else if (part.removed) {
        lines.push({ kind: "removed", text, oldNo: oldNo++, newNo: null });
      } else {
        lines.push({ kind: "context", text, oldNo: oldNo++, newNo: newNo++ });
      }
    }
  }
  return lines;
}

/**
 * Group a diff into sections, collapsing long unchanged runs so the changes
 * stand out. Context lines stay visible around each change; runs at the very
 * start/end of the document keep context only on their change-facing side.
 */
export function collapseUnchanged(lines: DiffLine[]): DiffSection[] {
  const sections: DiffSection[] = [];
  const push = (isCollapsed: boolean, part: DiffLine[]): void => {
    if (part.length === 0) return;
    const last = sections[sections.length - 1];
    if (last && last.isCollapsed === isCollapsed) {
      last.lines.push(...part);
    } else {
      sections.push({ isCollapsed, lines: [...part] });
    }
  };

  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "context") {
      push(false, [lines[i]]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].kind === "context") j++;
    const run = lines.slice(i, j);
    const lead = i === 0 ? 0 : CONTEXT_LINES;
    const tail = j === lines.length ? 0 : CONTEXT_LINES;
    if (run.length - lead - tail >= MIN_COLLAPSED_LINES) {
      push(false, run.slice(0, lead));
      push(true, run.slice(lead, run.length - tail));
      push(false, run.slice(run.length - tail));
    } else {
      push(false, run);
    }
    i = j;
  }
  return sections;
}
