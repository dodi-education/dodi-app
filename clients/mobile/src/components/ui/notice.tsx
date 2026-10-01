import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "./text";

const TONES = {
  info: "bg-primary-soft text-primary",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
} as const;

/** An inline message strip (errors, hints, outcomes). */
export function Notice({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  const [bg, fg] = TONES[tone].split(" ");
  return (
    <View accessibilityRole="alert" className={cn("rounded-xl px-3 py-2", bg)}>
      <Text className={cn("text-sm font-medium", fg)}>{children}</Text>
    </View>
  );
}
