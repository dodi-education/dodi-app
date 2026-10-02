import type { ReactNode } from "react";
import { View } from "react-native";
import { badge, type BadgeVariant } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/** The web's Badge (pill), same variants. */
export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn(badge.box({ variant }), "self-start", className)}>
      <Text className={badge.text({ variant })} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}
