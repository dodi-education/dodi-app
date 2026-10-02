import type { ViewStyle } from "react-native";
import { type KidShadow, kidShadow } from "@dodi/ui-recipes";

/** A kid recipe shadow as React Native style (the web's arbitrary box-shadows). */
export function kidShadowStyle(name: KidShadow): ViewStyle {
  const s = kidShadow[name];
  return {
    shadowColor: s.color,
    shadowOpacity: s.opacity,
    shadowRadius: s.radius / 2,
    shadowOffset: { width: 0, height: s.offsetY },
    elevation: s.elevation,
  };
}
