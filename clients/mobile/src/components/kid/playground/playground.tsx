import { useEffect } from "react";
import { BackHandler, Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import type { PlaygroundPanel } from "@dodi/client-state/companion-stage-store";
import { playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useCompanionStageStore } from "@/lib/client-state";

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
 * The Playground on kid home (web: components/kid/playground/playground): a
 * masks badge on the stage's side switches between normal mode and playground
 * mode, where the tools open in a bottom panel below the 3D character. Only
 * there while the 3D character shows. Android's back closes it (web: Escape).
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
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closePlayground();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, closePlayground]);

  if (!isCharacterShown) return null;

  return (
    <>
      <Pressable
        accessibilityRole="togglebutton"
        accessibilityState={{ selected: isOpen }}
        accessibilityLabel={isOpen ? t("close") : t("open")}
        accessibilityHint={t("tagline")}
        onPress={() => (isOpen ? closePlayground() : openPlayground())}
        className={cn(p.badge, isOpen && p.badgeOpen, "active:opacity-80")}
      >
        <Icon name="personas" size={p.badgeIcon} color={isOpen ? "primary-foreground" : "ink-2"} />
      </Pressable>

      {isOpen ? (
        <View className={p.panel} accessibilityLabel={t("title")}>
          <View>
            <KidText className={p.title} accessibilityRole="header">
              {t("title")}
            </KidText>
            <KidText className={p.tagline}>{t("tagline")}</KidText>
          </View>
          <View className={p.tabs} accessibilityRole="tablist">
            {PANELS.map((item) => {
              const isActive = panel === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setPanel(item.id)}
                  className={cn(p.tab, "flex-row gap-1.5", isActive && p.tabActive)}
                >
                  <Icon name={item.icon} size={16} color={isActive ? "dodi-500" : "ink-2"} />
                  <KidText className={cn(p.tabText, isActive && p.tabTextActive)}>{t(item.labelKey)}</KidText>
                </Pressable>
              );
            })}
          </View>
          <ScrollView
            className="shrink"
            contentContainerClassName={cn(p.section, "gap-4")}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
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
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}
