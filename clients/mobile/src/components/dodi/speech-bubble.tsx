import type { ReactNode } from "react";
import { View } from "react-native";
import { speechBubble } from "@dodi/ui-recipes";

import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { cn } from "@/lib/cn";

/**
 * dodi's speech bubble (web: components/dodi/speech-bubble), the tail pointing
 * up at dodi. Text inside uses KidText with `speechBubble.text`.
 */
export function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View
      className={cn(speechBubble.box, className)}
      style={kidShadowStyle("bubble")}
      accessibilityLiveRegion="polite"
    >
      <View className={speechBubble.tail} style={{ marginLeft: speechBubble.tailOffset }} />
      <View className={speechBubble.inner}>{children}</View>
    </View>
  );
}
