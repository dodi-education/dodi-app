import { Pressable } from "react-native";
import { COLORS } from "@dodi/design-tokens";
import { gamePreview as g } from "@dodi/ui-recipes";

import { Icon, type IconName, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Stage switch pill (Infos / Code / Preview), the studio's SegTab twin (web: game-preview). */
export function SegTab({
  isActive,
  onPress,
  icon,
  label,
}: {
  isActive: boolean;
  onPress: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      hitSlop={{ top: 7, bottom: 7 }}
      onPress={onPress}
      className={cn(g.segment, isActive && g.segmentActive)}
      style={
        isActive
          ? {
              shadowColor: COLORS.foreground,
              shadowOpacity: 0.06,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 1,
            }
          : undefined
      }
    >
      <Icon name={icon} size={15} color={isActive ? "ink" : "muted-foreground"} />
      <Text className={cn(g.segmentText, isActive ? g.segmentActiveText : g.segmentIdleText)}>{label}</Text>
    </Pressable>
  );
}
