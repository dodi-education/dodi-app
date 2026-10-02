/**
 * The language switcher (web: shared/language-switcher): a small ghost button
 * (globe + "EN") that opens the language list. The web's list is a dropdown
 * popover; inside a Section card (overflow hidden) it opens in the bottom
 * Sheet instead. This device switches at once; the account carries the choice
 * to the family's other devices.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { persistLanguage } from "@dodi/client-state/onboarding";
import { SUPPORTED_LOCALES, type Locale } from "@dodi/intl/locales";

import { api } from "@/adapters/platform";
import { Icon, Sheet, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useLocaleSetting } from "@/lib/intl";

const LOCALE_LABELS: Record<Locale, string> = { en: "EN", de: "DE" };

export function LanguageSwitcher() {
  const t = useTranslations("settings");
  const { locale, setLocale } = useLocaleSetting();
  const [isOpen, setIsOpen] = useState(false);

  function select(next: Locale): void {
    setIsOpen(false);
    if (next === locale) return;
    setLocale(next);
    void persistLanguage({ api, account: clientState.account }, next);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("language")}
        accessibilityValue={{ text: LOCALE_LABELS[locale] }}
        hitSlop={8}
        onPress={() => setIsOpen(true)}
        className="flex-row items-center gap-1 rounded-md px-2 py-1.5 active:bg-accent"
      >
        <Icon name="globe" size={16} color="muted-foreground" />
        <Text className="text-xs font-medium text-muted-foreground">{LOCALE_LABELS[locale]}</Text>
      </Pressable>
      <Sheet isOpen={isOpen} onClose={() => setIsOpen(false)} title={t("language")}>
        <View className="gap-0.5">
        {SUPPORTED_LOCALES.map((l) => {
          const isSelected = l === locale;
          return (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => select(l)}
              className="min-h-11 flex-row items-center rounded-sm px-3 active:bg-accent"
            >
              <Text className={cn("text-sm", isSelected ? "font-semibold text-primary" : "text-popover-foreground")}>
                {LOCALE_LABELS[l]}
              </Text>
            </Pressable>
          );
        })}
        </View>
      </Sheet>
    </>
  );
}
