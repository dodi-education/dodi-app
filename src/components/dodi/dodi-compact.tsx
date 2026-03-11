"use client";

import Image from "next/image";

import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { getDodiImage } from "@/lib/dodi-image";

export function DodiCompact() {
  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const error = useDodiSessionStore((s) => s.error);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);

  const isConnected = dodiState === "active" || dodiState === "deaf";
  const isConnecting = dodiState === "connecting";

  function handleClick() {
    toggleActive();
  }

  const ariaLabel =
    dodiState === "connecting"
      ? "Dodi connecting"
      : dodiState === "active"
        ? "Mute Dodi"
        : dodiState === "deaf"
          ? "Unmute Dodi"
          : dodiState === "sleep"
            ? "Tap to wake Dodi"
            : error
              ? "Tap to reconnect Dodi"
              : "Tap to start Dodi";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isConnecting}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
      aria-label={ariaLabel}
    >
      <Image
        src={getDodiImage(dodiState, true)}
        alt="Dodi"
        width={32}
        height={32}
        className="rounded-full"
      />
      {/* Speaking indicator ring */}
      {dodiSpeaking && (
        <span className="absolute inset-0 animate-ping rounded-full border-2 border-dodi-400 opacity-40" />
      )}
      {/* Connecting spinner */}
      {isConnecting && (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-dodi-400 border-t-transparent" />
      )}
      {/* Status dot */}
      {isConnected && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
      )}
      {dodiState === "disconnected" && error && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
      )}
    </button>
  );
}
