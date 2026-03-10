"use client";

import Image from "next/image";

import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { getDodiImage } from "@/lib/dodi-image";

export function DodiCompact() {
  const status = useDodiSessionStore((s) => s.status);
  const profileId = useDodiSessionStore((s) => s.profileId);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const micActive = useDodiSessionStore((s) => s.micActive);
  const audioReady = useDodiSessionStore((s) => s.audioReady);
  const toggleMic = useDodiSessionStore((s) => s.toggleMic);
  const startSessionFromTap = useDodiSessionStore((s) => s.startSessionFromTap);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isError = status === "error";
  // Audio output needs a user tap to unlock (AudioContext suspended)
  const needsTap = isConnected && !audioReady;

  function handleClick() {
    if (isConnecting) return;
    if (needsTap && profileId) {
      // Unlock audio output via user gesture
      void startSessionFromTap(profileId);
    } else if (isConnected) {
      toggleMic();
    } else if (profileId) {
      void startSessionFromTap(profileId);
    }
  }

  const ariaLabel = isConnecting
    ? "Dodi connecting"
    : needsTap
      ? "Tap to activate Dodi"
      : isConnected
        ? micActive
          ? "Mute microphone"
          : "Unmute microphone"
        : isError
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
        src={getDodiImage(isConnected, micActive, true)}
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
      {isError && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
      )}
    </button>
  );
}
