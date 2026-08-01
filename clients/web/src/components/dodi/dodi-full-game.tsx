"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { useOnline } from "@/hooks/use-online";
import {
  useDodiSessionStore,
  selectDodiThinking,
  selectDodiActivityKind,
  type CompanionMessage,
} from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";
import { getDodiImage } from "@/lib/dodi-image";

/**
 * A contextual quick action the panel offers for the current game (save a
 * photo, ask for a hint, …). Selecting one either runs the action directly or
 * sends a prepared message into the dodi chat — the play view decides.
 */
export interface GameAssistantAction {
  id: string;
  icon: IconName;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function DodiFullGame({
  actions,
}: {
  /** Contextual quick actions for the current game, rendered as chips. */
  actions?: GameAssistantAction[];
}) {
  const t = useTranslations("games");

  const dodiState = useDodiSessionStore((s) => s.state);
  const kidId = useDodiSessionStore((s) => s.kidId);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  const activityKind = useDodiSessionStore(selectDodiActivityKind);
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
  const isOnline = useOnline();

  // Offline wins: dodi sleeps, and a "tap to reconnect" hint would mislead.
  const stateLine = !isOnline
    ? t("offline")
    : activityKind === "image"
      ? t("voiceCreatingImage")
      : activityKind === "writing"
        ? t("voiceWritingText")
        : activityKind === "thinking"
          ? t("voiceThinking")
          : isConnecting
            ? t("voiceConnecting")
            : dodiState === "active"
              ? dodiSpeaking
                ? t("voiceSpeaking")
                : t("voiceListening")
              : t("tapToReconnect");

  return (
    // Content-sized (not stretched to the stage height): with the action chips
    // in view the panel stays compact and the chat area scrolls within a cap.
    <section className="flex flex-col rounded-[20px] bg-white p-[18px] shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
      {/* Dodi avatar + status */}
      <div className="flex items-center gap-3 border-b border-border pb-3.5">
        <button
          type="button"
          onClick={() => {
            if (isConnecting) return;
            if (isConnected) {
              toggleActive();
            } else if (kidId) {
              void connect(kidId);
            }
          }}
          disabled={isConnecting}
          className={cn(
            "relative size-14 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            !isConnecting && "cursor-pointer active:scale-90",
          )}
          aria-label={
            isConnecting
              ? "dodi connecting"
              : dodiState === "active"
                ? "Mute dodi"
                : dodiState === "deaf"
                  ? "Unmute dodi"
                  : "Tap to reconnect dodi"
          }
        >
          {dodiState === "active" && !dodiSpeaking && !isThinking && (
            <ListeningPulse className="-inset-2" />
          )}
          <Image
            src={isThinking ? "/images/dodi-thinking.png" : getDodiImage(dodiState, false)}
            alt={activityKind === "image" ? "dodi is creating a picture" : activityKind === "writing" ? "dodi is writing" : activityKind === "thinking" ? "dodi is thinking" : dodiState === "active" ? "dodi listening" : dodiState === "deaf" ? "dodi can't hear you" : "dodi sleeping"}
            fill
            sizes="300px"
            className="relative z-[1] object-contain"
          />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14.5px] font-extrabold text-ink">
            {!isOnline && (
              <Icon
                name="wifi_off"
                className="h-3.5 w-3.5 text-muted-foreground"
              />
            )}
            {isOnline && isConnecting && (
              <Icon name="loading" className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
            {(isThinking || (dodiSpeaking && dodiState === "active")) && (
              <span className="flex gap-1">
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary" />
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary [animation-delay:200ms]" />
                <span className="animate-kdot inline-block size-1.5 rounded-full bg-primary [animation-delay:400ms]" />
              </span>
            )}
            <span className="min-w-0">{stateLine}</span>
          </div>
        </div>
      </div>

      {/* Contextual quick actions for this game */}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border py-3">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={action.onSelect}
              disabled={action.disabled}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[12.5px] font-extrabold text-primary transition-colors hover:bg-primary-soft-2 disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon name={action.icon} size={14} stroke={2.5} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Dodi's spoken text output */}
      <div
        ref={scrollRef}
        className="flex max-h-[280px] min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto pt-3.5"
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
