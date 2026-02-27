"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { SpeechBubble } from "@/components/dodi/speech-bubble";

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
        // Silent failure — the greeting was already shown
      });
    }
  }, [hasProvider, firstInteraction, profileId]);

  if (!hasProvider) {
    // No AI provider configured
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

  if (!firstInteraction) {
    // First time with a voice provider — special greeting
    return (
      <SpeechBubble className="w-full max-w-xs text-center">
        <p className="text-lg font-bold text-dodi-800">
          {t("firstVoice")}
        </p>
      </SpeechBubble>
    );
  }

  // Normal session greeting
  return (
    <SpeechBubble className="w-full max-w-xs text-center">
      <p className="text-lg font-bold text-dodi-800">
        {t("greetingWithName", { name: profileName })}
      </p>
    </SpeechBubble>
  );
}
