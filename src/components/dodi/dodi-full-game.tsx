"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { useDodiSessionStore, type CompanionMessage } from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";
import { getDodiImage } from "@/lib/dodi-image";

export function DodiFullGame() {
  const t = useTranslations("games");

  const dodiState = useDodiSessionStore((s) => s.state);
  const profileId = useDodiSessionStore((s) => s.profileId);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const connect = useDodiSessionStore((s) => s.connect);
  const chatMessages = useDodiSessionStore((s) => s.chatMessages);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const isConnecting = dodiState === "connecting";
  const isConnected = dodiState === "active" || dodiState === "deaf";

  const stateLine = isConnecting
    ? t("voiceConnecting")
    : dodiState === "active"
      ? dodiSpeaking
        ? t("voiceSpeaking")
        : t("voiceListening")
      : t("tapToReconnect");

  return (
    <section className="flex h-full flex-col rounded-[20px] bg-white p-[18px] shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
      {/* Dodi avatar + status */}
      <div className="flex items-center gap-3 border-b border-border pb-3.5">
        <button
          type="button"
          onClick={() => {
            if (isConnecting) return;
            if (isConnected) {
              toggleActive();
            } else if (profileId) {
              void connect(profileId);
            }
          }}
          disabled={isConnecting}
          className={cn(
            "relative size-14 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            !isConnecting && "cursor-pointer active:scale-90",
          )}
          aria-label={
            isConnecting
              ? "Dodi connecting"
              : dodiState === "active"
                ? "Mute Dodi"
                : dodiState === "deaf"
                  ? "Unmute Dodi"
                  : "Tap to reconnect Dodi"
          }
        >
          {dodiState === "active" && !dodiSpeaking && (
            <ListeningPulse className="-inset-2" />
          )}
          <Image
            src={getDodiImage(dodiState, false)}
            alt={dodiState === "active" ? "Dodi listening" : dodiState === "deaf" ? "Dodi can't hear you" : "Dodi sleeping"}
            fill
            className="relative z-[1] object-contain"
          />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14.5px] font-extrabold text-ink">
            {isConnecting && (
              <Icon name="loading" className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
            {dodiSpeaking && dodiState === "active" && (
              <span className="flex gap-1">
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary" />
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary [animation-delay:200ms]" />
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary [animation-delay:400ms]" />
              </span>
            )}
            <span className="truncate">{stateLine}</span>
          </div>
        </div>
      </div>

      {/* Dodi's spoken text output */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto pt-3.5"
      >
        {chatMessages.length === 0 ? (
          <p className="m-auto px-3 text-center text-[13px] font-bold leading-relaxed text-faint">
            {t("companionEmptyState")}
          </p>
        ) : (
          chatMessages.map((msg: CompanionMessage) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[85%] rounded-[14px] px-3 py-2 text-[13.5px] font-bold leading-snug",
                msg.role === "dodi"
                  ? "self-start rounded-bl-[4px] bg-muted text-ink-2"
                  : "self-end rounded-br-[4px] bg-primary text-white",
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
