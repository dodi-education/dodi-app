import { Children, isValidElement, type ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Three equal columns with hairline dividers (web: grid grid-cols-3 divide-x divide-border). */
export function StatStrip({ className, children }: { className?: string; children: ReactNode }) {
  const cells = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn("flex-row", className)}>
      {cells.map((cell, i) => (
        <View key={cell.key ?? i} className={cn("flex-1", i > 0 && "border-l border-border")}>
          {cell}
        </View>
      ))}
    </View>
  );
}

export function StatCell({ num, label }: { num: ReactNode; label: string }) {
  return (
    <View className="p-5" accessible accessibilityLabel={`${String(num)} ${label}`}>
      <Text className="text-2xl font-bold tracking-tight">{num}</Text>
      <Text className="mt-1 text-[12.5px] text-muted-foreground">{label}</Text>
    </View>
  );
}
