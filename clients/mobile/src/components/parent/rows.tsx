import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { fieldRow, requiredMark, row, stackField } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

type Props = { className?: string; children?: ReactNode };

/** Hairline-divided list row inside a Section; pressable when `onPress` is set. */
export function Row({
  className,
  children,
  onPress,
  accessibilityLabel,
}: Props & { onPress?: () => void; accessibilityLabel?: string }) {
  const classes = cn(row.box, className);
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cn(classes, "active:bg-[#FAFCFE]")}
    >
      {children}
    </Pressable>
  ) : (
    <View className={classes}>{children}</View>
  );
}

export function RowMain({ className, children }: Props) {
  return <View className={cn(row.main, className)}>{children}</View>;
}

/** Title line: a string becomes semibold text; elements (badges) sit beside it. */
export function RowTitle({ className, children }: Props) {
  return (
    <View className={cn(row.title, className)}>
      {typeof children === "string" ? <Text className={row.titleText}>{children}</Text> : children}
    </View>
  );
}

export function RowTitleText({ children }: { children: ReactNode }) {
  return <Text className={row.titleText} numberOfLines={1}>{children}</Text>;
}

/** `numberOfLines` stands in for the web's `truncate` on a meta line. */
export function RowMeta({ className, children, numberOfLines }: Props & { numberOfLines?: number }) {
  return (
    <Text className={cn(row.meta, className)} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** Separator dot between meta segments (inside RowMeta text). */
export function DotSep() {
  return <Text className={row.dot}>·</Text>;
}

/** Subtle red asterisk on a mandatory field (decorative). */
export function RequiredMark() {
  return (
    <Text className={requiredMark} accessibilityElementsHidden importantForAccessibility="no">
      *
    </Text>
  );
}

/** Settings row: label (and hint) above the control on phones. */
export function FieldRow({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn(fieldRow.box, className)}>
      <View>
        <Text className={fieldRow.label}>
          {label}
          {required ? <RequiredMark /> : null}
        </Text>
        {hint ? typeof hint === "string" ? <Text className={fieldRow.hint}>{hint}</Text> : hint : null}
      </View>
      <View className={fieldRow.control}>{children}</View>
    </View>
  );
}

/** Full-width field block (text areas, forms) inside a Section. */
export function StackField({ className, children }: Props) {
  return <View className={cn(stackField, className)}>{children}</View>;
}
