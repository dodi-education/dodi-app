import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { audiencePill } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Compact audience pill: "Family" (icon) or one kid (initial). Share + import dialogs. */
export function AudiencePill({
  isSelected,
  onPress,
  label,
  hasIcon,
  initial,
}: {
  isSelected: boolean;
  onPress: () => void;
  label: string;
  hasIcon?: boolean;
  initial?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(audiencePill.box, isSelected ? audiencePill.selected : audiencePill.idle)}
    >
      {hasIcon ? (
        <Icon name="friends" size={16} color={isSelected ? "primary" : "muted-foreground"} />
      ) : (
        <View className={audiencePill.initial}>
          <Text className={audiencePill.initialText}>{initial}</Text>
        </View>
      )}
      <Text className={cn(audiencePill.text, isSelected ? audiencePill.selectedText : audiencePill.idleText)}>
        {label}
      </Text>
      {isSelected ? <Icon name="check" size={14} stroke={3} color="primary" /> : null}
    </Pressable>
  );
}

/** The pill row (family first, then each kid). */
export function AudiencePillRow({ children }: { children: ReactNode }) {
  return <View className={audiencePill.row}>{children}</View>;
}
