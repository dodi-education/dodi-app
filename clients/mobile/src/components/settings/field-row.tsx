import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui";

/** A read-only "label: value" row inside a settings card. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-11 gap-1 border-t border-border pt-3">
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}
