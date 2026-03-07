"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useDodiContext } from "@/hooks/use-dodi-context";

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

  const status = useDodiSessionStore((s) => s.status);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const micActive = useDodiSessionStore((s) => s.micActive);
  const error = useDodiSessionStore((s) => s.error);
  const prewarmSession = useDodiSessionStore((s) => s.prewarmSession);
  const startSessionFromTap = useDodiSessionStore((s) => s.startSessionFromTap);
  const ensureMicAfterGreeting = useDodiSessionStore((s) => s.ensureMicAfterGreeting);
  const toggleMic = useDodiSessionStore((s) => s.toggleMic);

  // Prewarm on mount if provider available
  useEffect(() => {
    if (hasProvider) {
      void prewarmSession(profileId);
    }
  }, [hasProvider, prewarmSession, profileId]);

  if (!hasProvider) {
    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src="/images/dodi-full.png"
            alt="Dodi"
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

  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src="/images/dodi-full.png"
            alt="Dodi"
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

  if (status === "error") {
    const knownErrors = ["micPermissionNeeded", "secureContextRequired"] as const;
    const isKnownError = knownErrors.some((key) => error === key);
    const errorMessage = isKnownError
      ? t(error as (typeof knownErrors)[number])
      : t("connectionError");

    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src="/images/dodi-full.png"
            alt="Dodi"
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
            onClick={() => void startSessionFromTap(profileId)}
            className="cursor-pointer"
          >
            <Icon name="refresh" className="mr-2 h-4 w-4" />
            {t("tapToRetry")}
          </Button>
        </div>
      </div>
    );
  }

  if (status === "connected") {
    const showMicRecovery = !micActive && error === "micPermissionNeeded";
    const showSecureContextError = !micActive && error === "secureContextRequired";

    return (
      <div className="flex flex-col items-center gap-6 pt-8">
        <div className="relative h-48 w-48">
          <Image
            src="/images/dodi-full.png"
            alt="Dodi"
            fill
            className="object-contain"
            priority
          />
        </div>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            {dodiSpeaking ? (
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:300ms]" />
                </div>
                <p className="text-sm text-dodi-600">{t("dodiSpeaking")}</p>
              </div>
            ) : showMicRecovery || showSecureContextError ? (
              <p className="text-sm text-dodi-600">
                {t(error as "micPermissionNeeded" | "secureContextRequired")}
              </p>
            ) : (
              <p className="text-sm text-dodi-600">
                {t("listening")}
              </p>
            )}
          </SpeechBubble>

          {showMicRecovery ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => void ensureMicAfterGreeting()}
              className="cursor-pointer"
            >
              <Icon name="refresh" className="mr-2 h-4 w-4" />
              {t("tapToRetry")}
            </Button>
          ) : (
            <Button
              variant={micActive ? "default" : "outline"}
              size="icon"
              onClick={toggleMic}
              disabled={showSecureContextError}
              className="h-12 w-12 cursor-pointer rounded-full"
              aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
            >
              {micActive ? (
                <Icon name="mic_on" className="h-5 w-5" />
              ) : (
                <Icon name="mic_off" className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Idle state — full-screen gesture target to unlock browser audio autoplay
  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <div className="relative h-48 w-48">
        <Image
          src="/images/dodi-full.png"
          alt="Dodi"
          fill
          className="object-contain"
          priority
        />
      </div>

      <button
        type="button"
        onPointerDown={() => void startSessionFromTap(profileId)}
        onClick={() => void startSessionFromTap(profileId)}
        className="fixed inset-0 z-20 cursor-pointer bg-transparent"
        aria-label={t("tapToStart")}
      />

      <div className="pointer-events-none relative z-30 flex w-full max-w-xs flex-col items-center gap-3 text-center">
        <SpeechBubble className="w-full text-center">
          <p className="text-lg font-bold text-dodi-800">
            {t("greetingWithName", { name: profileName })}
          </p>
          <p className="mt-1 text-sm text-dodi-600">
            {t("tapToStart")}
          </p>
        </SpeechBubble>
        <span className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-dodi-500 shadow-lg">
          <Icon name="mic_on" className="h-9 w-9 text-white" />
        </span>
      </div>
    </div>
  );
}
