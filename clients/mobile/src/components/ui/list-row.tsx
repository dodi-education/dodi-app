import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "@/lib/cn";

import { IconChevronRight } from "./icons";
import { Text } from "./text";

/** A tappable navigation row: icon, label, chevron (settings menus). */
export function ListRow({
  label,
  icon,
  onPress,
  isFirst = false,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  /** No divider above the first row of a group. */
  isFirst?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn("min-h-12 flex-row items-center gap-3 px-4 py-3", !isFirst && "border-t border-border")}
    >
      {icon ? <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">{icon}</View> : null}
      <Text className="flex-1 font-medium">{label}</Text>
      <IconChevronRight size={18} color="#93A5B8" />
    </Pressable>
  );
}
