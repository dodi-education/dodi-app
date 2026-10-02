import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  initialScreenshotService,
  isScreenshotUrlInvalid,
  saveScreenshotService,
} from "@dodi/client-state/game-studio-settings";
import type { GameScreenshotServiceMode } from "@dodi/types/database";
import { radioCard } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button, Icon, Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { clientState, useAccountStore, useVaultStore } from "@/lib/client-state";

/**
 * Game Studio settings (web: parent/settings/game-studio/page): which
 * screenshot service, if any, the build agent may use to look at real frames
 * of a game. A custom URL is sealed before it leaves the device
 * (`@dodi/client-state/game-studio-settings`). Explicit Save.
 */
export default function GameStudioSettingsScreen() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const session = useVaultStore((s) => s.session);
  const account = useAccountStore((s) => s.account);
  const isLoaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);

  const [draft, setDraft] = useState<{ mode: GameScreenshotServiceMode; customUrl: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // The stored choice until the parent edits it (null while a sealed URL waits for the vault).
  const initial = isLoaded ? initialScreenshotService(account, session) : null;
  const form = draft ?? initial ?? { mode: "dodi" as const, customUrl: "" };
  const isHydrated = Boolean(draft ?? initial);
  const isUrlInvalid = isScreenshotUrlInvalid(form);
  const edit = (patch: Partial<typeof form>): void => setDraft({ ...form, ...patch });

  async function save(): Promise<void> {
    setError(null);
    setIsSaving(true);
    const failure = await saveScreenshotService(
      { api, account: clientState.account, vault: clientState.vault },
      form,
    );
    if (failure) {
      setError("key" in failure ? t(failure.key) : failure.message);
    } else {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    }
    setIsSaving(false);
  }

  const options: { value: GameScreenshotServiceMode; label: string; hint: string }[] = [
    { value: "off", label: t("screenshotServiceOff"), hint: t("screenshotServiceOffHint") },
    { value: "dodi", label: t("screenshotServiceDodi"), hint: t("screenshotServiceDodiHint") },
    { value: "custom", label: t("screenshotServiceCustom"), hint: t("screenshotServiceCustomHint") },
  ];

  return (
    <Section title={t("gameStudioVisualTitle")} desc={t("gameStudioVisualDescription")}>
      <View className={radioCard.group} accessibilityRole="radiogroup" accessibilityLabel={t("screenshotServiceLabel")}>
        {options.map((option) => {
          const isSelected = form.mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: !isHydrated }}
              disabled={!isHydrated}
              onPress={() => edit({ mode: option.value })}
              className={cn(radioCard.box, isSelected ? radioCard.boxSelected : radioCard.boxIdle)}
            >
              <View className={cn(radioCard.dot, isSelected ? radioCard.dotSelected : radioCard.dotIdle)}>
                {isSelected ? <Icon name="check" size={radioCard.dotIconSize} stroke={3} color="primary-foreground" /> : null}
              </View>
              <View className={cn(radioCard.body, "flex-1")}>
                <Text className={cn(radioCard.label, isSelected ? radioCard.labelSelected : radioCard.labelIdle)}>
                  {option.label}
                </Text>
                <Text className={radioCard.hint}>{option.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {form.mode === "custom" ? (
        <FieldRow label={t("screenshotServiceUrlLabel")} hint={t("screenshotServiceUrlHint")} required>
          <Input
            value={form.customUrl}
            onChangeText={(customUrl) => edit({ customUrl })}
            placeholder={t("screenshotServiceUrlPlaceholder")}
            isInvalid={isUrlInvalid}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t("screenshotServiceUrlLabel")}
          />
        </FieldRow>
      ) : null}
      {error || isUrlInvalid ? (
        <View className="px-5 py-3">
          <Text className="text-sm text-danger" accessibilityRole="alert">
            {error ?? t("screenshotServiceUrlInvalid")}
          </Text>
        </View>
      ) : null}
      <SaveRow note={isSaved ? tc("saved") : undefined}>
        <Button onPress={() => void save()} disabled={isSaving || !isHydrated}>
          {isSaving ? tc("loading") : tc("save")}
        </Button>
      </SaveRow>
    </Section>
  );
}
