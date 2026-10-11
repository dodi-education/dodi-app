import { Pressable } from "react-native";
import { useTranslations } from "use-intl";
import { companionHearing as h } from "@dodi/ui-recipes";

import { Icon } from "@/components/ui";
import { useDodiSessionStore } from "@/lib/dodi-session-store";
import { cn } from "@/lib/cn";

import { kidShadowStyle } from "./kid-shadow";

/**
 * The kid's hearing toggle in the header, beside the volume control (web:
 * components/kid/companion-hearing-toggle): turns dodi's listening on and off
 * (deaf mode, kids.deafened_dodi_at), the same `toggleActive` a tap on dodi
 * runs. Shown only while a conversation is up.
 */
export function CompanionHearingToggle() {
  const t = useTranslations("games");
  const dodiState = useDodiSessionStore((s) => s.state);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);

  if (dodiState !== "active" && dodiState !== "deaf") return null;
  const isDeaf = dodiState === "deaf";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDeaf ? t("voiceAriaStartListening") : t("voiceAriaStopListening")}
      onPress={toggleActive}
      className={cn(h.button, "active:opacity-80")}
      style={kidShadowStyle("sm")}
    >
      <Icon name={isDeaf ? "deaf" : "ear"} size={h.icon} color={isDeaf ? "danger" : "foreground"} />
    </Pressable>
  );
}
