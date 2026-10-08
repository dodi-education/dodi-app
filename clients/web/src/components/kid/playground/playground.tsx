"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import type { PlaygroundPanel } from "@dodi/client-state/companion-stage-store";
import { playground as p } from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import { useCompanionStageStore } from "@/stores/companion-stage-store";

import { CompanionSwitcher } from "./companion-switcher";
import { LookPanel } from "./look-panel";
import { TeachTrickPanel } from "./teach-trick-panel";
import { TricksPanel } from "./tricks-panel";

const PANELS: { id: PlaygroundPanel; labelKey: "panelLook" | "panelTricks" | "panelTeach"; icon: IconName }[] = [
  { id: "look", labelKey: "panelLook", icon: "palette" },
  { id: "tricks", labelKey: "panelTricks", icon: "play" },
  { id: "teach", labelKey: "panelTeach", icon: "wand" },
];

/**
 * The Playground on kid home: a masks badge on the stage's side switches
 * between normal mode and playground mode, where the tools fade in around the
 * 3D character. Only there while the 3D character shows.
 */
export function Playground() {
  const t = useTranslations("playground");
  const isCharacterShown = useCompanionStageStore((s) => s.isCharacterShown);
  const isOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  const panel = useCompanionStageStore((s) => s.panel);
  const openPlayground = useCompanionStageStore((s) => s.openPlayground);
  const closePlayground = useCompanionStageStore((s) => s.closePlayground);
  const setPanel = useCompanionStageStore((s) => s.setPanel);

  // Leaving kid home closes it.
  useEffect(() => () => closePlayground(), [closePlayground]);
  useEffect(() => {
    if (!isCharacterShown && isOpen) closePlayground();
  }, [isCharacterShown, isOpen, closePlayground]);
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && closePlayground();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closePlayground]);

  if (!isCharacterShown) return null;

  return (
    <>
      <button
        type="button"
        className={cn(p.badge, p.webBadge, isOpen && p.badgeOpen, isOpen && p.webBadgeOpen)}
        aria-pressed={isOpen}
        aria-label={isOpen ? t("close") : t("open")}
        title={t("tagline")}
        onClick={() => (isOpen ? closePlayground() : openPlayground())}
      >
        <Icon name="personas" size={p.badgeIcon} className={isOpen ? p.badgeIconOpenColor : p.badgeIconColor} />
      </button>

      {isOpen ? (
        <section className={cn(p.panel, p.webPanel)} aria-label={t("title")}>
          <div>
            <h2 className={p.title}>{t("title")}</h2>
            <p className={p.tagline}>{t("tagline")}</p>
          </div>
          <div className={cn(p.tabs, p.webTabs)} role="tablist">
            {PANELS.map((item) => {
              const isActive = panel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={cn(p.tab, p.webTab, "gap-1.5", isActive && p.tabActive)}
                  onClick={() => setPanel(item.id)}
                >
                  <Icon name={item.icon} size={16} className={isActive ? p.tabTextActive : p.tabText} />
                  <span className={cn(p.tabText, isActive && p.tabTextActive)}>{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
          <div role="tabpanel" className={cn(p.section, p.webSection, "gap-4")}>
            {panel === "look" ? (
              <>
                <CompanionSwitcher />
                <LookPanel />
              </>
            ) : panel === "tricks" ? (
              <TricksPanel />
            ) : (
              <TeachTrickPanel />
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
