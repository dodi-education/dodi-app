import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { COLORS } from "@dodi/design-tokens";
import { studioSeg, studioTab, studioTabBar } from "@dodi/ui-recipes";

import { Icon, type IconName, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

interface TabProps {
  isActive: boolean;
  onPress: () => void;
  icon: IconName;
  label: string;
}

/** One side of the full-width Game / dodi switch above the panes. */
export function StudioTab({ isActive, onPress, icon, label }: TabProps) {
  return (
    <Pressable
      hitSlop={{ top: 5, bottom: 5 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      className={cn(studioTab.box, isActive ? studioTab.active : studioTab.idle)}
    >
      <Icon name={icon} size={studioTab.icon.size} color={isActive ? "primary" : "muted-foreground"} />
      <Text className={cn(studioTab.text, isActive ? studioTab.activeText : studioTab.idleText)}>{label}</Text>
    </Pressable>
  );
}

/** The Game / dodi switch row (vertical layout only). */
export function StudioTabBar({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="tablist" className={studioTabBar.box}>
      {children}
    </View>
  );
}

/** One segment of the stage's view switch (Plan / Settings / Code / Preview). */
export function SegTab({ isActive, onPress, icon, label }: TabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      className={cn(studioSeg.box, isActive && studioSeg.active)}
      style={
        isActive
          ? { shadowColor: COLORS.ink, shadowOpacity: 0.06, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
          : undefined
      }
    >
      <Icon name={icon} size={studioSeg.icon.size} color={isActive ? "ink" : "muted-foreground"} />
      <Text className={cn(studioSeg.text, isActive ? studioSeg.activeText : studioSeg.idleText)}>{label}</Text>
    </Pressable>
  );
}
