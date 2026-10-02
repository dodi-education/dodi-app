import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { type GestureResponderEvent, View } from "react-native";
import { pageGradient } from "@dodi/ui-recipes";

/** The web's body background: a soft blue-to-white vertical gradient. */
export function PageBackground({
  children,
  onTouchStart,
}: {
  children: ReactNode;
  /** Sees every touch inside (it bubbles); never claims it. */
  onTouchStart?: (event: GestureResponderEvent) => void;
}) {
  return (
    <View className="flex-1" onTouchStart={onTouchStart}>
      <LinearGradient
        colors={[...pageGradient.colors]}
        locations={[...pageGradient.locations]}
        style={{ position: "absolute", inset: 0 }}
      />
      {children}
    </View>
  );
}
