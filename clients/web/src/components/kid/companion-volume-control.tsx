"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { companionVolume as v } from "@dodi/ui-recipes";

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
    <div ref={rootRef} className={v.root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(v.button, v.webButton, muted && v.mutedButtonText)}
        aria-label={t("voiceVolumeOpen")}
        aria-expanded={open}
      >
        <Icon name={iconName} className="h-5 w-5" />
      </button>

      {open && (
        <div
          className={cn(v.flyout, v.webFlyout)}
          role="group"
          aria-label={t("voiceVolume")}
        >
          <label
            htmlFor={sliderId}
            className={cn(v.webLabel, v.label)}
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
            className={v.webSlider}
          />

          <button
            type="button"
            onClick={() => setMuted(!muted, activeKidId ?? undefined)}
            className={cn(
              v.mute,
              v.webMute,
              v.muteText,
              muted
                ? [v.muteOn, v.muteOnText]
                : [v.muteOff, v.muteOffText, v.webMuteOff],
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
