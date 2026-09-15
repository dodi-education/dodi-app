"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useActiveKidStore } from "@/stores/active-kid-store";
import { useCompanionVolumeStore } from "@/stores/companion-volume-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";

/**
 * Kid-facing output-volume control in the header: a round button that opens a
 * slider plus a full-mute toggle. Volume level is per-kid/localStorage; full
 * mute is the session store's `setMuted` (persisted on kids.muted_dodi_at).
 * Both are output-only — neither changes whether dodi is listening.
 */
export function CompanionVolumeControl() {
  const t = useTranslations("games");
  const sliderId = useId();

  const volume = useCompanionVolumeStore((s) => s.volume);
  const setVolume = useCompanionVolumeStore((s) => s.setVolume);
  const muted = useDodiSessionStore((s) => s.muted);
  const setMuted = useDodiSessionStore((s) => s.setMuted);
  const activeKidId = useActiveKidStore((s) => s.activeKidId);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while the flyout is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const percent = Math.round(volume * 100);
  const iconName = muted ? "volume_off" : volume <= 0.5 ? "volume_low" : "volume";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md",
          muted && "text-danger",
        )}
        aria-label={t("voiceVolumeOpen")}
        aria-expanded={open}
      >
        <Icon name={iconName} className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-dodi-200 bg-white p-4 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
          role="group"
          aria-label={t("voiceVolume")}
        >
          <label
            htmlFor={sliderId}
            className="mb-2 block text-[13px] font-bold text-ink-2"
          >
            {t("voiceVolume")}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : percent}
            disabled={muted}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label={t("voiceVolume")}
            className="h-11 w-full cursor-pointer accent-dodi-500 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => setMuted(!muted, activeKidId ?? undefined)}
            className={cn(
              "mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-bold transition-colors",
              muted
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-dodi-200 bg-white text-ink-2 hover:bg-dodi-50",
            )}
            aria-pressed={muted}
          >
            <Icon name={muted ? "volume" : "volume_off"} className="h-4 w-4" />
            {muted ? t("voiceUnmuteAll") : t("voiceMuteAll")}
          </button>
        </div>
      )}
    </div>
  );
}
