"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { getDodiImage } from "@/lib/dodi-image";

interface DodiFullHomeProps {
  profileId: string;
  profileName: string;
  hasProvider: boolean;
}

export function DodiFullHome({
  profileId,
  profileName,
  hasProvider,
}: DodiFullHomeProps) {
  const t = useTranslations("kid");

  useDodiContext({
    context: { type: "home" },
    displayMode: "full",
    profileId,
  });

  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const gestureNeeded = useDodiSessionStore((s) => s.gestureNeeded);
  const error = useDodiSessionStore((s) => s.error);
  const connect = useDodiSessionStore((s) => s.connect);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);

  // Auto-connect on mount if provider available
  useEffect(() => {
    if (hasProvider) {
      void connect(profileId);
    }
  }, [hasProvider, connect, profileId]);

  // No provider configured
  if (!hasProvider) {
    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src={getDodiImage("disconnected", false)}
            alt="Dodi sleeping"
            fill
            className="object-contain"
            priority
          />
        </div>
        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-lg font-bold text-dodi-800">
            {t("greetingWithName", { name: profileName })}
          </p>
          <p className="mt-1 text-sm text-dodi-600">
            {t("needsVoice")}
          </p>
        </SpeechBubble>
      </div>
    );
  }

  // Connecting
  if (dodiState === "connecting") {
    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src={getDodiImage("connecting", false)}
            alt="Dodi waking up"
            fill
            className="object-contain"
            priority
          />
        </div>
        <SpeechBubble className="w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2">
            <Icon name="loading" className="h-4 w-4 animate-spin text-dodi-600" />
            <p className="text-sm text-dodi-600">{t("connecting")}</p>
          </div>
        </SpeechBubble>
      </div>
    );
  }

  // Connected: active or deaf
  if (dodiState === "active" || dodiState === "deaf") {
    const showMicError = dodiState === "active" && (error === "micPermissionNeeded" || error === "secureContextRequired");

    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <button
          type="button"
          onClick={toggleActive}
          className="relative h-48 w-48 cursor-pointer transition-transform active:scale-95 hover:scale-105"
          aria-label={dodiState === "active" ? "Mute Dodi" : "Unmute Dodi"}
        >
          <Image
            src={getDodiImage(dodiState, false)}
            alt={dodiState === "active" ? "Dodi listening" : "Dodi can't hear you"}
            fill
            className="object-contain"
            priority
          />
        </button>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            {dodiState === "deaf" && gestureNeeded ? (
              <p className="text-sm text-dodi-600">
                {t("tapToTalk")}
              </p>
            ) : dodiState === "deaf" ? (
              <p className="text-sm text-dodi-600">
                {t("tapToStart")}
              </p>
            ) : dodiSpeaking ? (
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:300ms]" />
                </div>
                <p className="text-sm text-dodi-600">{t("dodiSpeaking")}</p>
              </div>
            ) : showMicError ? (
              <p className="text-sm text-dodi-600">
                {t(error as "micPermissionNeeded" | "secureContextRequired")}
              </p>
            ) : (
              <p className="text-sm text-dodi-600">
                {t("listening")}
              </p>
            )}
          </SpeechBubble>
        </div>
      </div>
    );
  }

  // Sleep (inactivity timeout) — tap to wake
  if (dodiState === "sleep") {
    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <button
          type="button"
          onClick={() => void connect(profileId)}
          className="relative h-48 w-48 cursor-pointer transition-transform active:scale-95 hover:scale-105"
          aria-label={t("tapToStart")}
        >
          <Image
            src={getDodiImage("sleep", false)}
            alt="Dodi sleeping — tap to wake"
            fill
            className="object-contain"
            priority
          />
        </button>

        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-sm text-dodi-600">
            {t("tapToStart")}
          </p>
        </SpeechBubble>
      </div>
    );
  }

  // Disconnected (idle or error)
  if (error) {
    const knownErrors = ["micPermissionNeeded", "secureContextRequired"] as const;
    const isKnownError = knownErrors.some((key) => error === key);
    const errorMessage = isKnownError
      ? t(error as (typeof knownErrors)[number])
      : t("connectionError");

    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src={getDodiImage("disconnected", false)}
            alt="Dodi sleeping"
            fill
            className="object-contain"
            priority
          />
        </div>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            <p className="text-sm text-dodi-600">{errorMessage}</p>
            {error && !isKnownError && (
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            )}
          </SpeechBubble>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void connect(profileId)}
            className="cursor-pointer"
          >
            <Icon name="refresh" className="mr-2 h-4 w-4" />
            {t("tapToRetry")}
          </Button>
        </div>
      </div>
    );
  }

  // Idle — tap sleeping Dodi to start
  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <button
        type="button"
        onClick={() => void connect(profileId)}
        className="relative h-48 w-48 cursor-pointer transition-transform active:scale-95 hover:scale-105"
        aria-label={t("tapToStart")}
      >
        <Image
          src={getDodiImage("disconnected", false)}
          alt="Dodi sleeping — tap to wake"
          fill
          className="object-contain"
          priority
        />
      </button>

      <SpeechBubble className="w-full max-w-xs text-center">
        <p className="text-lg font-bold text-dodi-800">
          {t("greetingWithName", { name: profileName })}
        </p>
        <p className="mt-1 text-sm text-dodi-600">
          {t("tapToStart")}
        </p>
      </SpeechBubble>
    </div>
  );
}
