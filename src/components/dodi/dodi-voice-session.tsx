"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Mic, MicOff, RefreshCw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { useVoiceSessionStore } from "@/stores/voice-session-store";

interface DodiVoiceSessionProps {
  profileId: string;
  profileName: string;
}

export function DodiVoiceSession({
  profileId,
  profileName,
}: DodiVoiceSessionProps) {
  const t = useTranslations("kid");
  const { status, dodiSpeaking, micActive, error, startSession, endSession, toggleMic } =
    useVoiceSessionStore();

  // Clean up session on unmount only — no auto-start
  useEffect(() => {
    return () => {
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "connecting") {
    return (
      <SpeechBubble className="w-full max-w-xs text-center">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-dodi-600" />
          <p className="text-sm text-dodi-600">{t("connecting")}</p>
        </div>
      </SpeechBubble>
    );
  }

  if (status === "error") {
    const knownErrors = ["micPermissionNeeded", "secureContextRequired"] as const;
    const isKnownError = knownErrors.some((key) => error === key);
    const errorMessage = isKnownError
      ? t(error as (typeof knownErrors)[number])
      : t("connectionError");

    return (
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
          onClick={() => startSession(profileId)}
          className="cursor-pointer"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("tapToRetry")}
        </Button>
      </div>
    );
  }

  if (status === "connected") {
    return (
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
          ) : (
            <p className="text-sm text-dodi-600">
              {t("listening")}
            </p>
          )}
        </SpeechBubble>

        <Button
          variant={micActive ? "default" : "outline"}
          size="icon"
          onClick={toggleMic}
          className="h-12 w-12 cursor-pointer rounded-full"
          aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
        >
          {micActive ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5" />
          )}
        </Button>
      </div>
    );
  }

  // idle state — require user tap to start (browser autoplay policy)
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <SpeechBubble className="w-full text-center">
        <p className="text-lg font-bold text-dodi-800">
          {t("greetingWithName", { name: profileName })}
        </p>
        <p className="mt-1 text-sm text-dodi-600">
          {t("tapToTalk")}
        </p>
      </SpeechBubble>
      <Button
        size="icon"
        onClick={() => startSession(profileId)}
        className="h-14 w-14 cursor-pointer rounded-full bg-dodi-500 hover:bg-dodi-600"
        aria-label={t("tapToTalk")}
      >
        <Mic className="h-6 w-6 text-white" />
      </Button>
    </div>
  );
}
