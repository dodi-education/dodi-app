"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { getDodiImage } from "@/lib/dodi-image";

interface DodiFullHomeProps {
  profileId: string;
  profileName: string;
  hasProvider: boolean;
}

/** Shared stage wrapper: vertically centered column with mascot sizing. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-auto flex flex-col items-center gap-5 py-4">
      {children}
    </div>
  );
}

function MascotWrap({
  listening,
  children,
}: {
  listening?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex aspect-square w-[clamp(170px,38vh,300px)] items-center justify-center">
      {listening ? <ListeningPulse /> : null}
      {children}
    </div>
  );
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

  const mascotButtonClass =
    "relative z-[1] size-[76%] cursor-pointer transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.94]";
  const mascotImageClass = "relative z-[1]";

  // No provider configured
  if (!hasProvider) {
    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <Image
              src={getDodiImage("disconnected", false)}
              alt="Dodi sleeping"
              fill
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-lg font-extrabold text-ink">
            {t("greetingWithName", { name: profileName })}
          </p>
          <p className="mt-1 text-sm font-bold text-ink-2">{t("needsVoice")}</p>
        </SpeechBubble>
      </Stage>
    );
  }

  // Connecting
  if (dodiState === "connecting") {
    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <Image
              src={getDodiImage("connecting", false)}
              alt="Dodi waking up"
              fill
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2">
            <Icon name="loading" className="h-4 w-4 animate-spin text-primary" />
            <p className="text-sm font-bold text-ink-2">{t("connecting")}</p>
          </div>
        </SpeechBubble>
      </Stage>
    );
  }

  // Connected: active or deaf
  if (dodiState === "active" || dodiState === "deaf") {
    const showMicError = dodiState === "active" && (error === "micPermissionNeeded" || error === "secureContextRequired");

    return (
      <Stage>
        <MascotWrap listening={dodiState === "active" && !dodiSpeaking}>
          <button
            type="button"
            onClick={toggleActive}
            className={mascotButtonClass}
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
        </MascotWrap>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            {dodiState === "deaf" && gestureNeeded ? (
              <p className="text-sm font-bold text-ink-2">{t("tapToTalk")}</p>
            ) : dodiState === "deaf" ? (
              <p className="text-sm font-bold text-ink-2">{t("tapToStart")}</p>
            ) : dodiSpeaking ? (
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1">
                  <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary" />
                  <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary [animation-delay:200ms]" />
                  <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary [animation-delay:400ms]" />
                </div>
                <p className="text-sm font-bold text-ink-2">{t("dodiSpeaking")}</p>
              </div>
            ) : showMicError ? (
              <p className="text-sm font-bold text-ink-2">
                {t(error as "micPermissionNeeded" | "secureContextRequired")}
              </p>
            ) : (
              <p className="text-sm font-bold text-ink-2">{t("listening")}</p>
            )}
          </SpeechBubble>
          <p className="text-sm font-bold text-faint">
            {dodiState === "active" && !showMicError ? t("tapToTalk") : " "}
          </p>
        </div>
      </Stage>
    );
  }

  // Sleep (inactivity timeout) — tap to wake
  if (dodiState === "sleep") {
    return (
      <Stage>
        <MascotWrap>
          <button
            type="button"
            onClick={() => void connect(profileId)}
            className={mascotButtonClass}
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
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-sm font-bold text-ink-2">{t("tapToStart")}</p>
        </SpeechBubble>
      </Stage>
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
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <Image
              src={getDodiImage("disconnected", false)}
              alt="Dodi sleeping"
              fill
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            <p className="text-sm font-bold text-ink-2">{errorMessage}</p>
            {error && !isKnownError && (
              <p className="mt-1 text-xs font-semibold text-muted-foreground">{error}</p>
            )}
          </SpeechBubble>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void connect(profileId)}
            className="cursor-pointer rounded-full font-bold"
          >
            <Icon name="refresh" className="mr-2 h-4 w-4" />
            {t("tapToRetry")}
          </Button>
        </div>
      </Stage>
    );
  }

  // Idle — tap sleeping Dodi to start
  return (
    <Stage>
      <MascotWrap>
        <button
          type="button"
          onClick={() => void connect(profileId)}
          className={mascotButtonClass}
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
      </MascotWrap>
      <SpeechBubble className="w-full max-w-xs text-center">
        <p className="text-lg font-extrabold text-ink">
          {t("greetingWithName", { name: profileName })}
        </p>
        <p className="mt-1 text-sm font-bold text-ink-2">{t("tapToStart")}</p>
      </SpeechBubble>
    </Stage>
  );
}
