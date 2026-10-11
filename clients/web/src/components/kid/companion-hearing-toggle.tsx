"use client";

import { useTranslations } from "next-intl";
import { companionHearing as h } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { cn } from "@/lib/utils";

/**
 * Kid-facing hearing toggle in the header, beside the volume control: turns
 * dodi's listening on and off (deaf mode, persisted on kids.deafened_dodi_at),
 * the same `toggleActive` a tap on dodi runs. Shown only while a conversation
 * is up, where the toggle means listening and nothing else.
 */
export function CompanionHearingToggle() {
  const t = useTranslations("games");
  const dodiState = useDodiSessionStore((s) => s.state);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);

  if (dodiState !== "active" && dodiState !== "deaf") return null;
  const isDeaf = dodiState === "deaf";

  return (
    <button
      type="button"
      onClick={toggleActive}
      className={cn(h.button, h.webButton, isDeaf && h.deafButtonText)}
      aria-label={isDeaf ? t("voiceAriaStartListening") : t("voiceAriaStopListening")}
    >
      <Icon name={isDeaf ? "deaf" : "ear"} className="h-5 w-5" />
    </button>
  );
}
