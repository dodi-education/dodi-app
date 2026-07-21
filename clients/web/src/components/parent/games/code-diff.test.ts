import { describe, expect, it } from "vitest";

import { buildDiffLines, collapseUnchanged } from "./code-diff";

/** "l1\nl2\n…\nlN" */
const doc = (n: number, prefix = "l"): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join("\n");

describe("buildDiffLines", () => {
  it("numbers an in-place edit on both sides", () => {
    const previous = "a\nb\nc";
    const current = "a\nB\nc";
    expect(buildDiffLines(previous, current)).toEqual([
      { kind: "context", text: "a", oldNo: 1, newNo: 1 },
      { kind: "removed", text: "b", oldNo: 2, newNo: null },
      { kind: "added", text: "B", oldNo: null, newNo: 2 },
      { kind: "context", text: "c", oldNo: 3, newNo: 3 },
    ]);
  });

  it("keeps numbering aligned after an insertion", () => {
    const previous = "a\nc";
    const current = "a\nb\nc";
    const lines = buildDiffLines(previous, current);
    expect(lines).toEqual([
      { kind: "context", text: "a", oldNo: 1, newNo: 1 },
      { kind: "added", text: "b", oldNo: null, newNo: 2 },
      { kind: "context", text: "c", oldNo: 2, newNo: 3 },
    ]);
  });

  it("does not produce a phantom line for a trailing newline", () => {
    const lines = buildDiffLines("a\nb\n", "a\nb\nc\n");
    expect(lines.map((l) => l.text)).toEqual(["a", "b", "c"]);
  });
});

describe("collapseUnchanged", () => {
  it("collapses a long unchanged run, keeping context on both sides of it", () => {
    // change at the top, 30 unchanged lines, change at the bottom
    const previous = `x\n${doc(30)}\ny`;
    const current = `X\n${doc(30)}\nY`;
    const sections = collapseUnchanged(buildDiffLines(previous, current));

    expect(sections.map((s) => s.isCollapsed)).toEqual([false, true, false]);
    // 3 context lines survive on each side of the collapsed middle
    expect(sections[0].lines.filter((l) => l.kind === "context")).toHaveLength(3);
    expect(sections[1].lines).toHaveLength(24);
    expect(sections[1].lines.every((l) => l.kind === "context")).toBe(true);
    expect(sections[2].lines.filter((l) => l.kind === "context")).toHaveLength(3);
  });

  it("keeps short unchanged runs expanded", () => {
    const previous = `x\n${doc(8)}\ny`;
    const current = `X\n${doc(8)}\nY`;
    const sections = collapseUnchanged(buildDiffLines(previous, current));
    expect(sections).toHaveLength(1);
    expect(sections[0].isCollapsed).toBe(false);
  });

  it("collapses a leading run with context only on its change-facing side", () => {
    const previous = `${doc(20)}\nend`;
    const current = `${doc(20)}\nEND`;
    const sections = collapseUnchanged(buildDiffLines(previous, current));

    expect(sections[0].isCollapsed).toBe(true);
    expect(sections[0].lines).toHaveLength(17); // 20 − 3 pre-change context lines
    const visible = sections[1];
    expect(visible.isCollapsed).toBe(false);
    expect(visible.lines.map((l) => l.kind)).toEqual([
      "context",
      "context",
      "context",
      "removed",
      "added",
    ]);
  });
});
