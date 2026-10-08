import { Linking, Pressable } from "react-native";
import { useTranslations } from "use-intl";
import { legalUrl, SETTINGS_LEGAL_PAGES } from "@dodi/client-state/legal-links";

import { Row, RowMain } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon, Text } from "@/components/ui";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";

const LABEL_KEYS: Record<(typeof SETTINGS_LEGAL_PAGES)[number], string> = {
  privacy: "legalPrivacy",
  terms: "legalTerms",
  imprint: "legalImprint",
};

/** Settings > General > Legal (web: components/parent/legal-links): the policies on the marketing site. */
export function LegalLinks() {
  const t = useTranslations("settings");
  const { locale } = useLocaleSetting();

  return (
    <Section title={t("legalTitle")} desc={t("legalDescription")}>
      {SETTINGS_LEGAL_PAGES.map((page) => (
        <Row key={page}>
          <RowMain>
            <Pressable
              accessibilityRole="link"
              hitSlop={14}
              onPress={() => void Linking.openURL(legalUrl(SITE_URL, page, locale))}
              className="flex-row items-center gap-1.5 self-start active:opacity-70"
            >
              <Text className="text-sm font-semibold text-ink">{t(LABEL_KEYS[page])}</Text>
              <Icon name="external" size={14} color="muted-foreground" />
            </Pressable>
          </RowMain>
        </Row>
      ))}
    </Section>
  );
}
