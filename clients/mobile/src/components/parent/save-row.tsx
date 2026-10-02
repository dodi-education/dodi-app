import type { ReactNode } from "react";
import { View } from "react-native";
import { saveRow } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";

/** Section footer row: a left note ("Changes saved") and right-aligned actions. */
export function SaveRow({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <View className={saveRow.box}>
      {note ? <Text className={saveRow.note}>{note}</Text> : null}
      {children}
    </View>
  );
}
