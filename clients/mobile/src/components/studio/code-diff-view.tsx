import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { buildDiffLines, collapseUnchanged, type DiffLine } from "@dodi/studio/code-diff";
import { codeDiff, codeViewer } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { CODE_LINE_HEIGHT } from "./code-text";

interface CodeDiffViewProps {
  /** The stored pre-change version (left side of the diff). */
  previousCode: string;
  /** The current code (right side of the diff). */
  code: string;
  /** i18n line for a collapsed run, e.g. "42 unchanged lines". */
  unchangedLabel: (count: number) => string;
}

type Entry = { type: "line"; line: DiffLine } | { type: "skip"; sectionIndex: number; count: number };

const ROW_TINT: Record<DiffLine["kind"], string | undefined> = {
  added: codeDiff.added,
  removed: codeDiff.removed,
  context: undefined,
};

const MARKER: Record<DiffLine["kind"], string> = { added: " + ", removed: " − ", context: "   " };

const ROW = { height: CODE_LINE_HEIGHT };

/**
 * Unified line diff between the previous and current game bundle (web:
 * CodeDiffView): line numbers for both versions, green added / red removed
 * rows, and long unchanged runs collapsed behind an expandable row.
 */
export function CodeDiffView({ previousCode, code, unchangedLabel }: CodeDiffViewProps) {
  const sections = useMemo(() => collapseUnchanged(buildDiffLines(previousCode, code)), [previousCode, code]);
  // Opened collapsed sections, by position within `sections`; a new diff drops them.
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

  // Width of one line-number column, in digits, from the larger version's line count.
  const digits = useMemo(() => {
    let maxNo = 1;
    for (const s of sections) {
      for (const l of s.lines) maxNo = Math.max(maxNo, l.oldNo ?? 0, l.newNo ?? 0);
    }
    return String(maxNo).length;
  }, [sections]);

  const expand = (sectionIndex: number): void => {
    setExpanded((prev) => new Set(prev).add(sectionIndex));
  };

  return (
    <ScrollView className="flex-1">
      <View className={codeViewer.body}>
        {/* Double gutter: previous | current line numbers, tinted like their rows. */}
        <View className={codeDiff.gutter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {entries.map((entry, i) =>
            entry.type === "skip" ? (
              <View key={i} className={codeDiff.skipNumber} style={ROW}>
                <Text className={cn(codeViewer.text, codeViewer.gutterText, "text-center")}>⋯</Text>
              </View>
            ) : (
              <View key={i} className={cn(codeDiff.numbers, ROW_TINT[entry.line.kind])} style={ROW}>
                <Text className={cn(codeViewer.text, codeViewer.gutterText)}>
                  {String(entry.line.oldNo ?? "").padStart(digits, " ")}
                </Text>
                <Text className={cn(codeViewer.text, codeViewer.gutterText)}>
                  {String(entry.line.newNo ?? "").padStart(digits, " ")}
                </Text>
              </View>
            ),
          )}
        </View>

        {/* Diff body: marker and line, full-width row tint, sideways scroll. */}
        <ScrollView horizontal className="flex-1">
          <View className={codeDiff.body}>
            {entries.map((entry, i) =>
              entry.type === "skip" ? (
                <Pressable
                  hitSlop={{ top: 15, bottom: 15 }}
                  key={i}
                  accessibilityRole="button"
                  onPress={() => expand(entry.sectionIndex)}
                  className={codeDiff.skip}
                  style={ROW}
                >
                  <Text className={codeDiff.skipText} style={{ lineHeight: CODE_LINE_HEIGHT }}>
                    {`⋯ ${unchangedLabel(entry.count)}`}
                  </Text>
                </Pressable>
              ) : (
                <View key={i} className={cn("flex-row", ROW_TINT[entry.line.kind])} style={ROW}>
                  <Text
                    className={cn(
                      codeViewer.text,
                      "font-bold",
                      entry.line.kind === "added" && codeDiff.addedMarker,
                      entry.line.kind === "removed" && codeDiff.removedMarker,
                    )}
                    style={{ lineHeight: CODE_LINE_HEIGHT }}
                  >
                    {MARKER[entry.line.kind]}
                  </Text>
                  <Text className={codeViewer.text} style={{ lineHeight: CODE_LINE_HEIGHT }}>
                    {entry.line.text}
                  </Text>
                </View>
              ),
            )}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}
