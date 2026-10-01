import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui";

/** A row of equal-width figures with dividers (web: parent/stat-strip). */
export function StatStrip({ children }: { children: ReactNode }) {
  return <View className="flex-row">{children}</View>;
}

export function StatCell({ num, label, isFirst = false }: { num: ReactNode; label: string; isFirst?: boolean }) {
  return (
    <View
      className={isFirst ? "flex-1 px-3 py-2" : "flex-1 border-l border-border px-3 py-2"}
      accessible
      accessibilityLabel={`${String(num)} ${label}`}
    >
      <Text className="text-2xl font-bold">{num}</Text>
      <Text variant="muted" className="mt-1 text-xs">
        {label}
      </Text>
    </View>
  );
}
