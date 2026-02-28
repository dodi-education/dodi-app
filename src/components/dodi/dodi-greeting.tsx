"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { DodiVoiceSession } from "@/components/dodi/dodi-voice-session";

interface DodiGreetingProps {
  profileId: string;
  profileName: string;
  hasProvider: boolean;
  firstInteraction: boolean;
}

export function DodiGreeting({
  profileId,
  profileName,
  hasProvider,
  firstInteraction,
}: DodiGreetingProps) {
  const t = useTranslations("kid");
  const markedRef = useRef(false);

  // If provider was just added and first_interaction is false,
  // mark it as true in the DB so subsequent visits show the normal greeting
  useEffect(() => {
    if (hasProvider && !firstInteraction && !markedRef.current) {
      markedRef.current = true;
      fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_interaction: true }),
      }).catch(() => {
        // Silent failure — the flag update is best-effort
      });
    }
  }, [hasProvider, firstInteraction, profileId]);

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

  // Provider is configured — start a live voice session
  // The system instruction includes the greeting, so Dodi will speak on connect
  return (
    <DodiVoiceSession
      profileId={profileId}
      profileName={profileName}
    />
  );
}
