import { useTranslations } from "use-intl";

import { useConnectivityStore } from "@/lib/client-state";
import { selectDodiThinking, useDodiSessionStore } from "@/lib/dodi-session-store";

/**
 * What the companion is doing right now, for screen readers: the value read
 * after the figure's or the voice button's name (the web's alt and ARIA
 * strings for dodi's states). Listening, talking, thinking, connecting,
 * asleep or offline.
 */
export function useCompanionStateLabel(): string {
  const tVoice = useTranslations("games");
  const tKid = useTranslations("kid");
  const state = useDodiSessionStore((s) => s.state);
  const isSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  const isOnline = useConnectivityStore((s) => s.isOnline);

  if (!isOnline) return tKid("offline");
  if (state === "connecting") return tVoice("voiceAriaConnecting");
  if (isThinking) return tVoice("voiceThinkingAlt");
  if (state === "active") return isSpeaking ? tVoice("voiceSpeaking") : tVoice("voiceListening");
  if (state === "deaf") return tVoice("voiceMicOff");
  return tVoice("voiceAriaAsleep"); // sleep, or not connected
}
