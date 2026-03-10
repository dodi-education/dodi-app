"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { useDodiSessionStore, type CompanionMessage } from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";
import { getDodiImage } from "@/lib/dodi-image";

export function DodiFullGame() {
  const t = useTranslations("games");

  const status = useDodiSessionStore((s) => s.status);
  const profileId = useDodiSessionStore((s) => s.profileId);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const micActive = useDodiSessionStore((s) => s.micActive);
  const audioReady = useDodiSessionStore((s) => s.audioReady);
  const toggleMic = useDodiSessionStore((s) => s.toggleMic);
  const startSessionFromTap = useDodiSessionStore((s) => s.startSessionFromTap);
  const chatMessages = useDodiSessionStore((s) => s.chatMessages);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const isConnecting = status === "connecting";
  const isConnected = status === "connected";
  const isError = status === "error";
  const needsTap = isConnected && !audioReady;

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-white shadow-sm">
      {/* Dodi avatar + status */}
      <div className="flex flex-col items-center gap-2 border-b px-4 py-4">
        <button
          type="button"
          onClick={() => {
            if (isConnecting) return;
            if (needsTap && profileId) {
              void startSessionFromTap(profileId);
            } else if (isConnected) {
              toggleMic();
            } else if (profileId) {
              void startSessionFromTap(profileId);
            }
          }}
          disabled={isConnecting}
          className={cn(
            "relative h-20 w-20 transition-transform",
            !isConnecting && "cursor-pointer active:scale-90 hover:scale-110",
          )}
          aria-label={
            isConnecting
              ? "Dodi connecting"
              : needsTap
                ? "Tap to activate Dodi"
                : isConnected
                  ? micActive
                    ? "Mute microphone"
                    : "Unmute microphone"
                  : "Tap to reconnect Dodi"
          }
        >
          <Image
            src={getDodiImage(isConnected, micActive, false)}
            alt={isConnected ? (micActive ? "Dodi listening" : "Dodi can't hear you") : "Dodi sleeping"}
            fill
            className="object-contain"
          />
          {dodiSpeaking && (
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-dodi-400 opacity-30" />
          )}
        </button>

        {isConnecting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="loading" className="h-3 w-3 animate-spin" />
            {t("voiceConnecting")}
          </div>
        )}

        {isConnected && !needsTap && (
          <SpeechBubble className="w-full text-center">
            {dodiSpeaking ? (
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-dodi-500 [animation-delay:300ms]" />
                </div>
                <p className="text-sm text-dodi-600">{t("voiceSpeaking")}</p>
              </div>
            ) : (
              <p className="text-sm text-dodi-600">
                {micActive ? t("voiceListening") : t("voiceMicOff")}
              </p>
            )}
          </SpeechBubble>
        )}

        {needsTap && (
          <p className="text-xs text-muted-foreground">
            {t("tapToReconnect")}
          </p>
        )}

        {(isError || (!isConnected && !isConnecting)) && (
          <p className="text-xs text-muted-foreground">
            {isError ? t("voiceSessionFailed") + " " : ""}
            {t("tapToReconnect")}
          </p>
        )}
      </div>

      {/* Dodi's spoken text output */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto p-3"
      >
        {chatMessages.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("companionEmptyState")}
          </p>
        ) : (
          chatMessages.map((msg: CompanionMessage) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[90%] rounded-xl px-3 py-2 text-sm",
                msg.role === "dodi"
                  ? "bg-dodi-50 text-dodi-800"
                  : "ml-auto bg-dodi-100 text-dodi-700 italic",
              )}
            >
              {msg.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
