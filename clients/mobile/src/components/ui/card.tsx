import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/** A titled white card: the unit settings and forms are grouped in. */
export function Card({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("gap-3 rounded-2xl border border-border bg-card p-4", className)}>
      {title ? <Text variant="heading">{title}</Text> : null}
      {description ? <Text variant="muted">{description}</Text> : null}
      {children}
    </View>
  );
}
