import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "./text";

const TONES = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
} as const;

/** A small status pill. */
export function Badge({ label, tone = "gray" }: { label: string; tone?: keyof typeof TONES }) {
  const [bg, fg] = TONES[tone].split(" ");
  return (
    <View className={cn("self-start rounded-full px-2 py-0.5", bg)}>
      <Text className={cn("text-xs font-semibold", fg)}>{label}</Text>
    </View>
  );
}
