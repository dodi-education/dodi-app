"use client";

import { useTranslations } from "next-intl";

import { companionCompact as c } from "@dodi/ui-recipes";

import { DodiFigure } from "@/components/dodi/dodi-figure";
import { Icon } from "@/components/shared/icon";
import {
  useDodiSessionStore,
  selectDodiActivityKind,
  selectDodiThinking,
} from "@/stores/dodi-session-store";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

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
      ? t("voiceAriaConnecting")
      : dodiState === "active"
        ? t("voiceAriaStopListening")
        : dodiState === "deaf"
          ? t("voiceAriaStartListening")
          : dodiState === "sleep"
            ? t("voiceAriaWake")
            : error
              ? t("voiceAriaReconnect")
              : t("voiceAriaStart");

  // Transient status shown in the bubble; idle states (listening, deaf,
  // disconnected) show no bubble — the avatar badge already conveys them.
  const statusLine =
    activityKind === "image"
      ? t("voiceCreatingImage")
      : activityKind === "writing"
        ? t("voiceWritingText")
        : activityKind === "thinking"
          ? t("voiceThinking")
          : isConnecting
            ? t("voiceConnecting")
            : dodiSpeaking && dodiState === "active"
              ? t("voiceSpeaking")
              : null;

  return (
    <div className={cn(c.webRoot, c.root)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isConnecting}
        className={cn(c.button, c.webButton)}
        aria-label={ariaLabel}
      >
        <DodiFigure
          state={dodiState}
          isThinking={isThinking}
          isHead
          alt={isThinking ? t("voiceThinkingAlt") : "dodi"}
          className={cn("rounded-full", isThinking && c.webThinking)}
        />
        {/* Speaking indicator ring */}
        {dodiSpeaking && (
          <span className={cn(c.speakingRing, c.webSpeakingRing)} />
        )}
        {/* Connecting spinner */}
        {isConnecting && (
          <span className={cn(c.connectingRing, c.webConnectingRing)} />
        )}
        {/* Status dot / offline badge */}
        {!isOnline ? (
          <span className={cn(c.offlineBadge, c.webOfflineBadge)}>
            <Icon
              name="wifi_off"
              className="h-2.5 w-2.5 text-muted-foreground"
            />
          </span>
        ) : (
          <>
            {isConnected && (
              <span className={cn(c.statusDot, c.connectedDot)} />
            )}
            {dodiState === "disconnected" && error && (
              <span className={cn(c.statusDot, c.errorDot)} />
            )}
          </>
        )}
      </button>

      {/* Status bubble — persistent live region so screen readers announce
          status changes; visually only present while dodi is doing something. */}
      <div aria-live="polite" className={c.liveRegion}>
        {statusLine ? (
          <div className={cn(c.bubble, c.webBubble)}>
            {/* Tail pointing left toward the dodi avatar */}
            <span className={cn(c.bubbleTail, c.webBubbleTail)} />
            <span className={cn(c.bubbleText, c.webBubbleText)}>
              {statusLine}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
