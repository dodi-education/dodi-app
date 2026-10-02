import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import type { DraftView } from "@dodi/studio/plan-state";
import { activeToggle, previewLocale as localeStyles, stageHeader, studioSeg } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { SegTab } from "./studio-tabs";

interface StageHeaderProps {
  view: DraftView;
  onViewChange: (view: DraftView) => void;
  /** Still a draft: the Plan segment is offered. */
  isPlanning: boolean;
  /** The preview language picker (only for games with a translations block). */
  showLocalePicker: boolean;
  previewLocale: string;
  onPreviewLocaleChange: (locale: string) => void;
  /** The game exists: the active toggle is shown. */
  hasGame: boolean;
  isActive: boolean;
  isTogglingActive: boolean;
  onToggleActive: () => void;
}

/**
 * The stage's header row (web: the studio's stage header): one switch for the
 * whole stage, the preview language, and the auto-saving active switch. The
 * audience initials are hidden at phone width on the web, so not here either.
 */
export function StageHeader({
  view,
  onViewChange,
  isPlanning,
  showLocalePicker,
  previewLocale,
  onPreviewLocaleChange,
  hasGame,
  isActive,
  isTogglingActive,
  onToggleActive,
}: StageHeaderProps) {
  const t = useTranslations("gameStudio");
  return (
    <View className={stageHeader.box}>
      <View accessibilityRole="tablist" className={studioSeg.group}>
        {isPlanning ? (
          <SegTab isActive={view === "plan"} onPress={() => onViewChange("plan")} icon="pencil" label={t("plan")} />
        ) : null}
        <SegTab
          isActive={view === "settings"}
          onPress={() => onViewChange("settings")}
          icon="settings"
          label={t("settings")}
        />
        <SegTab isActive={view === "code"} onPress={() => onViewChange("code")} icon="code" label={t("code")} />
        <SegTab isActive={view === "preview"} onPress={() => onViewChange("preview")} icon="show" label={t("preview")} />
      </View>
      {view === "preview" && showLocalePicker ? (
        <View accessibilityLabel={t("previewLanguage")} className={studioSeg.group}>
          {SUPPORTED_LOCALES.map((code) => {
            const isCurrent = previewLocale === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
                onPress={() => onPreviewLocaleChange(code)}
                hitSlop={8}
                className={cn(localeStyles.box, isCurrent && localeStyles.active)}
              >
                <Text className={cn(localeStyles.text, isCurrent ? localeStyles.activeText : localeStyles.idleText)}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {/* Audience + active state only exist once the game is created. */}
      {hasGame ? (
        <View className={stageHeader.right}>
          {/* Status is an auto-saving switch: flip active/inactive without opening settings. */}
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t("visibilityLabel")}
            accessibilityHint={t("activeHint")}
            accessibilityState={{ checked: isActive, disabled: isTogglingActive }}
            onPress={onToggleActive}
            disabled={isTogglingActive}
            hitSlop={8}
            className={cn(
              activeToggle.box,
              isActive ? activeToggle.on : activeToggle.off,
              isTogglingActive && activeToggle.disabled,
            )}
          >
            <View className={cn(activeToggle.track, isActive ? activeToggle.trackOn : activeToggle.trackOff)}>
              <View className={cn(activeToggle.thumb, isActive ? activeToggle.thumbOn : activeToggle.thumbOff)} />
            </View>
            <Text className={cn(activeToggle.text, isActive ? activeToggle.onText : activeToggle.offText)}>
              {isActive ? t("active") : t("inactive")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
