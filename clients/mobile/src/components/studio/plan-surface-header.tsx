import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { planSurface } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

interface PlanSurfaceHeaderProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  /** Right-aligned action, e.g. "Attach to chat" or the Modify toggle. */
  right?: ReactNode;
}

/**
 * Title row of a Plan surface (sketch, plan): a back arrow that returns to the
 * conversation, the surface's name, and room for one action.
 */
export function PlanSurfaceHeader({ title, backLabel, onBack, right }: PlanSurfaceHeaderProps) {
  return (
    <View className={planSurface.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        className={cn(planSurface.back, "active:bg-primary-soft")}
      >
        <Icon name="arrow_left" size={18} color="muted-foreground" />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} className={planSurface.title}>
        {title}
      </Text>
      {right}
    </View>
  );
}
