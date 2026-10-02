import { View } from "react-native";
import { formAlert } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";

/** An inline error inside a dialog (web: the danger-soft message box). */
export function FormAlert({ children }: { children: string }) {
  return (
    <View className={formAlert.box} accessibilityRole="alert">
      <Text className={formAlert.text}>{children}</Text>
    </View>
  );
}
