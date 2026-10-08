import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { legalUrl } from "@dodi/client-state/legal-links";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";

/**
 * The explicit permission the App Store requires before personal data goes to
 * a third-party AI (guideline 5.1.2(i)), ticked before a key is added or dodi
 * AI is turned on (web: components/parent/ai-sharing-consent).
 */
export function AiSharingConsent({
  checked,
  onCheckedChange,
  providerName,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The provider's display name; null for dodi AI (its providers are named in the copy). */
  providerName: string | null;
}) {
  const t = useTranslations("settings");
  const { locale } = useLocaleSetting();
  const privacy = (chunks: ReactNode) => (
    <Text
      accessibilityRole="link"
      onPress={() => void Linking.openURL(legalUrl(SITE_URL, "privacy", locale))}
      className="text-[13px] font-medium text-primary"
    >
      {chunks}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={14}
      className="flex-row items-start gap-2"
    >
      <View
        className={cn(
          "mt-0.5 size-4 shrink-0 items-center justify-center rounded-[4px] border",
          checked ? "border-primary bg-primary" : "border-border-strong bg-card",
        )}
      >
        {checked ? <Icon name="check" size={12} stroke={3} color="primary-foreground" /> : null}
      </View>
      <Text className="flex-1 text-[13px] text-ink-2">
        {providerName === null
          ? t.rich("aiSharingConsentManaged", { privacy })
          : t.rich("aiSharingConsent", { provider: providerName, privacy })}
      </Text>
    </Pressable>
  );
}
