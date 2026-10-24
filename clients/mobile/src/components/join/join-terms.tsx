import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { legalUrl, type LegalPage } from "@dodi/client-state/legal-links";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";

/** The guardian / terms / privacy consent, as on sign-up (web: auth/join/join-terms). */
export function JoinTerms({ isAccepted, onChange }: { isAccepted: boolean; onChange: (isAccepted: boolean) => void }) {
  const t = useTranslations("auth");
  const { locale } = useLocaleSetting();

  function legalLink(page: LegalPage, chunks: ReactNode): ReactNode {
    return (
      <Text
        key={page}
        accessibilityRole="link"
        onPress={() => void Linking.openURL(legalUrl(SITE_URL, page, locale))}
        className="text-sm font-medium text-primary"
      >
        {chunks}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isAccepted }}
      onPress={() => onChange(!isAccepted)}
      hitSlop={12}
      className="flex-row items-start gap-2"
    >
      <View
        className={cn(
          "mt-0.5 size-4 shrink-0 items-center justify-center rounded-[4px] border",
          isAccepted ? "border-primary bg-primary" : "border-border-strong bg-card",
        )}
      >
        {isAccepted ? <Icon name="check" size={12} stroke={3} color="primary-foreground" /> : null}
      </View>
      <Text className="flex-1 text-sm text-ink-2">
        {t.rich("termsConsent", {
          terms: (chunks) => legalLink("terms", chunks),
          privacy: (chunks) => legalLink("privacy", chunks),
        })}
      </Text>
    </Pressable>
  );
}
