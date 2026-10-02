import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { codeViewer as styles } from "@dodi/ui-recipes";

import { Icon, type IconName, Select, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { CodeDiffView } from "./code-diff-view";
import { chunkLines, CODE_LINE_HEIGHT } from "./code-text";

/** One entry in the version selector (date preformatted by the parent). */
export interface CodeViewerVersion {
  id: string;
  dateLabel: string;
}

/** Display form of a version id: its first 8 chars. */
function shortVersionId(id: string): string {
  return id.slice(0, 8);
}

interface CodeViewerProps {
  /** The game's HTML bundle (a full document with embedded CSS/JS). */
  code: string;
  /** The previous version's code; enables the "Show changes" diff toggle. */
  previousCode?: string | null;
  /** Diff mode on/off, controlled by the parent (chat links flip it too). */
  showChanges?: boolean;
  onShowChangesChange?: (next: boolean) => void;
  /** Version history for the selector, newest first. */
  versions?: CodeViewerVersion[];
  currentVersionId?: string | null;
  onSelectVersion?: (versionId: string) => void;
  /** Disables the selector while a build/switch is in flight. */
  busy?: boolean;
  filename?: string;
  copyLabel: string;
  copiedLabel: string;
  showChangesLabel?: string;
  showChangesUnavailableTitle?: string;
  unchangedLabel?: (count: number) => string;
  versionSelectorLabel?: string;
}

function HeaderButton({
  icon,
  label,
  onPress,
  isActive = false,
  disabled = false,
  accessibilityHint,
  iconColor,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  iconColor?: "success";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: isActive }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={cn(styles.button, isActive && styles.buttonActive, disabled && styles.buttonDisabled)}
    >
      <Icon name={icon} size={14} color={iconColor ?? (isActive ? "primary" : "muted-foreground")} />
      <Text className={cn(styles.buttonText, isActive ? styles.buttonActiveText : styles.buttonIdleText)}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A game's HTML bundle as a code editor would show it (web: CodeViewer): a
 * filename tab, copy, the diff toggle and the version picker over a
 * line-numbered, sideways-scrolling body. Read-only in the app (the web's
 * manual edit mode needs its CodeMirror editor), and without syntax colors.
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
  filename = "index.html",
  copyLabel,
  copiedLabel,
  showChangesLabel,
  showChangesUnavailableTitle,
  unchangedLabel,
  versionSelectorLabel,
}: CodeViewerProps) {
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canDiff = Boolean(previousCode) && previousCode !== code;
  const isDiffActive = showChanges && canDiff;
  const chunks = useMemo(() => chunkLines(code.split("\n")), [code]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await Clipboard.setStringAsync(code);
      setIsCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setIsCopied(false), 1600);
    } catch {
      /* clipboard unavailable: no-op */
    }
  };

  return (
    <View className={cn(styles.box, "flex-1")}>
      {/* Editor chrome: filename tab + copy / diff / version actions */}
      <View className={styles.header}>
        <View className={styles.filename}>
          <Icon name="code" size={14} color="faint" />
          <Text numberOfLines={1} className={styles.filenameText}>
            {filename}
          </Text>
        </View>
        <View className={styles.actions}>
          <HeaderButton
            icon={isCopied ? "check" : "copy"}
            iconColor={isCopied ? "success" : undefined}
            label={isCopied ? copiedLabel : copyLabel}
            onPress={() => void copy()}
          />
          {onShowChangesChange ? (
            <HeaderButton
              icon="diff"
              label={showChangesLabel ?? ""}
              isActive={isDiffActive}
              disabled={!canDiff}
              accessibilityHint={canDiff ? undefined : showChangesUnavailableTitle}
              onPress={() => onShowChangesChange(!showChanges)}
            />
          ) : null}
          {onSelectVersion && versions && versions.length > 0 ? (
            <Select
              value={currentVersionId ?? null}
              options={versions.map((v) => ({ value: v.id, label: `${shortVersionId(v.id)} · ${v.dateLabel}` }))}
              onValueChange={onSelectVersion}
              label={versionSelectorLabel ?? ""}
              disabled={busy}
              renderTrigger={(open, current) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={versionSelectorLabel}
                  accessibilityValue={{ text: current?.label }}
                  accessibilityState={{ disabled: busy }}
                  onPress={open}
                  disabled={busy}
                  hitSlop={8}
                  className={cn(styles.button, busy && styles.buttonDisabled)}
                >
                  <Icon name="history" size={14} color="muted-foreground" />
                  {/* The short id only: the phone header stays narrow (the list keeps both). */}
                  {current ? (
                    <Text className={cn(styles.buttonText, styles.buttonIdleText, "font-mono")}>
                      {shortVersionId(current.value)}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
          ) : null}
        </View>
      </View>

      {isDiffActive && previousCode ? (
        <CodeDiffView
          previousCode={previousCode}
          code={code}
          unchangedLabel={unchangedLabel ?? ((count) => `${count}`)}
        />
      ) : (
        <ScrollView className="flex-1">
          <View className={styles.body}>
            <View className={styles.gutter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {chunks.map(({ start, lines }) => (
                <Text key={start} className={cn(styles.text, styles.gutterText)} style={{ lineHeight: CODE_LINE_HEIGHT }}>
                  {lines.map((_, j) => start + j).join("\n")}
                </Text>
              ))}
            </View>
            <ScrollView horizontal className="flex-1">
              <View className={styles.code}>
                {chunks.map(({ start, lines }) => (
                  <Text key={start} selectable className={styles.text} style={{ lineHeight: CODE_LINE_HEIGHT }}>
                    {lines.join("\n")}
                  </Text>
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
