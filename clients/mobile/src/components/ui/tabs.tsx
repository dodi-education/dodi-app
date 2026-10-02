import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { tabs } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/** The web's underlined tab list (components/ui/tabs). */
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View accessibilityRole="tablist" className={cn(tabs.list, className)}>
      {children}
    </View>
  );
}

/** One tab: a string label is styled for you; elements (icon, badge) sit in a row. */
export function TabsTrigger({
  isActive,
  onPress,
  children,
}: {
  isActive: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      hitSlop={{ top: 12, bottom: 4 }}
      onPress={onPress}
      className={cn(tabs.trigger, "flex-row items-center gap-2", isActive && tabs.triggerActive)}
    >
      {typeof children === "string" ? <TabsLabel isActive={isActive}>{children}</TabsLabel> : children}
    </Pressable>
  );
}

export function TabsLabel({ isActive, children }: { isActive: boolean; children: ReactNode }) {
  return <Text className={cn(tabs.text, isActive && tabs.textActive)}>{children}</Text>;
}
