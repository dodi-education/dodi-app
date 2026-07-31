"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import {
  useDodiSessionStore,
  selectDodiActivityKind,
  selectDodiThinking,
} from "@/stores/dodi-session-store";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { getDodiImage } from "@/lib/dodi-image";

export function DodiCompact() {
  const t = useTranslations("games");

  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const error = useDodiSessionStore((s) => s.error);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  const activityKind = useDodiSessionStore(selectDodiActivityKind);
  const isOnline = useOnline();

  const isConnected = dodiState === "active" || dodiState === "deaf";
  const isConnecting = dodiState === "connecting";

  function handleClick() {
    toggleActive();
  }

  const ariaLabel =
    dodiState === "connecting"
      ? "dodi connecting"
      : dodiState === "active"
        ? "Mute dodi"
        : dodiState === "deaf"
          ? "Unmute dodi"
          : dodiState === "sleep"
            ? "Tap to wake dodi"
            : error
              ? "Tap to reconnect dodi"
              : "Tap to start dodi";

  // Transient status shown in the bubble; idle states (listening, deaf,
  // disconnected) show no bubble — the avatar badge already conveys them.
  const statusLine =
    activityKind === "image"
      ? t("voiceCreatingImage")
      : activityKind === "thinking"
        ? t("voiceThinking")
        : isConnecting
          ? t("voiceConnecting")
          : dodiSpeaking && dodiState === "active"
            ? t("voiceSpeaking")
            : null;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isConnecting}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
        aria-label={ariaLabel}
      >
        <Image
          src={
            isThinking
              ? "/images/dodi-head-thinking.png"
              : getDodiImage(dodiState, true)
          }
          alt={isThinking ? "dodi is thinking" : "dodi"}
          width={32}
          height={32}
          className={cn("rounded-full", isThinking && "animate-kspin")}
        />
        {/* Speaking indicator ring */}
        {dodiSpeaking && (
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-dodi-400 opacity-40" />
        )}
        {/* Connecting spinner */}
        {isConnecting && (
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-dodi-400 border-t-transparent" />
        )}
        {/* Status dot / offline badge */}
        {!isOnline ? (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-dodi-200 bg-white">
            <Icon
              name="wifi_off"
              className="h-2.5 w-2.5 text-muted-foreground"
            />
          </span>
        ) : (
          <>
            {isConnected && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-success" />
            )}
            {dodiState === "disconnected" && error && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-danger" />
            )}
          </>
        )}
      </button>

      {/* Status bubble — persistent live region so screen readers announce
          status changes; visually only present while dodi is doing something. */}
      <div aria-live="polite" className="min-w-0">
        {statusLine ? (
          <div className="relative flex h-10 min-w-0 items-center rounded-full bg-white px-3.5 shadow-sm animate-in fade-in slide-in-from-left-2 duration-200">
            {/* Tail pointing left toward the dodi avatar */}
            <span className="absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] bg-white" />
            <span className="relative min-w-0 truncate text-[13px] font-bold text-ink-2">
              {statusLine}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
