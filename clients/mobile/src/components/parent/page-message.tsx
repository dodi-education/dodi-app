import { View } from "react-native";
import { pageMessage } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";

/** A whole-page loading / not-found line (web: flex items-center justify-center py-12). */
export function PageMessage({ children }: { children: string }) {
  return (
    <View className={pageMessage.box}>
      <Text className={pageMessage.text}>{children}</Text>
    </View>
  );
}
