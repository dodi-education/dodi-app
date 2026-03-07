"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";

import { Icon } from "@/components/shared/icon";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";

export function DodiCompact() {
  const status = useDodiSessionStore((s) => s.status);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const micActive = useDodiSessionStore((s) => s.micActive);
  const toggleMic = useDodiSessionStore((s) => s.toggleMic);
  const chatMessages = useDodiSessionStore((s) => s.chatMessages);

  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [expanded]);

  const isActive = status === "connected";
  const lastDodiMessage = [...chatMessages].reverse().find((m) => m.role === "dodi");

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md"
        aria-label="Dodi companion"
      >
        <Image
          src="/images/dodi-head.png"
          alt="Dodi"
          width={32}
          height={32}
          className="rounded-full"
        />
        {/* Speaking indicator ring */}
        {dodiSpeaking && (
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-dodi-400 opacity-40" />
        )}
        {/* Active session dot */}
        {isActive && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="absolute left-0 top-12 z-50 w-72 rounded-2xl border border-dodi-200 bg-white p-3 shadow-lg">
          {lastDodiMessage ? (
            <SpeechBubble className="w-full text-sm">
              <p className="text-dodi-700">
                {lastDodiMessage.text.length > 120
                  ? `${lastDodiMessage.text.slice(0, 120)}...`
                  : lastDodiMessage.text}
              </p>
            </SpeechBubble>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              {isActive ? "Dodi is listening..." : "Dodi is here"}
            </p>
          )}

          {isActive && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  micActive
                    ? "bg-dodi-600 text-white"
                    : "bg-dodi-100 text-dodi-600",
                )}
                aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
              >
                {micActive ? (
                  <Icon name="mic_on" className="h-4 w-4" />
                ) : (
                  <Icon name="mic_off" className="h-4 w-4" />
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                {dodiSpeaking
                  ? "Dodi is speaking..."
                  : micActive
                    ? "Listening"
                    : "Mic off"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
