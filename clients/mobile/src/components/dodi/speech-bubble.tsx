import type { ReactNode } from "react";
import { View } from "react-native";
import { speechBubble } from "@dodi/ui-recipes";

import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { cn } from "@/lib/cn";

/**
 * dodi's speech bubble (web: components/dodi/speech-bubble), the tail pointing
 * up at dodi. Text inside uses KidText with `speechBubble.text`.
 */
export function SpeechBubble({
  children,
  className,
  isLive = true,
}: {
  children: ReactNode;
  className?: string;
  /**
   * TalkBack reads changes aloud (a live region, as the web's aria-live);
   * off while dodi listens and talks, so it doesn't talk over the voice.
   * VoiceOver has no live regions: the screen announces the same text.
   */
  isLive?: boolean;
}) {
  return (
    <View
      className={cn(speechBubble.box, className)}
      style={kidShadowStyle("bubble")}
      accessibilityLiveRegion={isLive ? "polite" : "none"}
    >
      <View
        className={speechBubble.tail}
        style={{ marginLeft: speechBubble.tailOffset }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View className={speechBubble.inner}>{children}</View>
    </View>
  );
}
