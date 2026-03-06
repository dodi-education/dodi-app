"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { DodiVoiceSession } from "@/components/dodi/dodi-voice-session";
import { useVoiceSessionStore } from "@/stores/voice-session-store";

interface DodiGreetingProps {
  profileId: string;
  profileName: string;
  hasProvider: boolean;
}

export function DodiGreeting({
  profileId,
  profileName,
  hasProvider,
}: DodiGreetingProps) {
  const t = useTranslations("kid");
  const prewarmSession = useVoiceSessionStore((state) => state.prewarmSession);

  useEffect(() => {
    if (hasProvider) {
      void prewarmSession(profileId);
    }
  }, [hasProvider, prewarmSession, profileId]);

  if (!hasProvider) {
    // No AI provider configured — text-only fallback
    return (
      <SpeechBubble className="w-full max-w-xs text-center">
        <p className="text-lg font-bold text-dodi-800">
          {t("greetingWithName", { name: profileName })}
        </p>
        <p className="mt-1 text-sm text-dodi-600">
          {t("needsVoice")}
        </p>
      </SpeechBubble>
    );
  }

  // Provider is configured — prewarm happens in background and starts on first tap
  return (
    <DodiVoiceSession
      key={profileId}
      profileId={profileId}
      profileName={profileName}
    />
  );
}
