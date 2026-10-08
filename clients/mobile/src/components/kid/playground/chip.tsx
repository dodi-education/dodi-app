import type { ReactNode } from "react";
import { Pressable, type AccessibilityRole } from "react-native";
import { playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { cn } from "@/lib/cn";

/**
 * The Playground's pill button (web: the panels' `p.chip` buttons), 44pt high
 * by its recipe. A string child is the label; other children (icons) sit in a row.
 */
export function PlaygroundChip({
  isSelected = false,
  disabled,
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityHint,
  children,
}: {
  isSelected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** "radio" in a radio group, "togglebutton" for on/off chips. */
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  children: ReactNode;
}) {
  const isToggle = accessibilityRole === "radio" || accessibilityRole === "togglebutton";
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: Boolean(disabled),
        ...(isToggle ? (accessibilityRole === "radio" ? { checked: isSelected } : { selected: isSelected }) : {}),
      }}
      disabled={disabled}
      onPress={onPress}
      className={cn(p.chip, isSelected && p.chipSelected, disabled && "opacity-50", "active:opacity-80")}
    >
      {typeof children === "string" ? <KidText className={p.chipText}>{children}</KidText> : children}
    </Pressable>
  );
}
