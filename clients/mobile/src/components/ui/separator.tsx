import { View } from "react-native";

import { cn } from "@/lib/cn";

/** A 1px hairline in the border color. */
export function Separator({ className }: { className?: string }) {
  return <View className={cn("h-px w-full bg-border", className)} />;
}
