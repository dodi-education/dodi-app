"use client";

import { useLocale, useTranslations } from "next-intl";

import { SETTINGS_LEGAL_PAGES } from "@dodi/client-state/legal-links";

import { Row, RowMain, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { siteUrl } from "@/lib/site-links";

const LABEL_KEYS: Record<(typeof SETTINGS_LEGAL_PAGES)[number], string> = {
  privacy: "legalPrivacy",
  terms: "legalTerms",
  imprint: "legalImprint",
};

/** Settings > General > Legal: the privacy policy, terms and imprint on the marketing site. */
export function LegalLinks() {
  const t = useTranslations("settings");
  const locale = useLocale();

  return (
    <Section title={t("legalTitle")} desc={t("legalDescription")}>
      {SETTINGS_LEGAL_PAGES.map((page) => (
        <Row key={page}>
          <RowMain>
            <RowTitle>
              <a
                href={siteUrl(page, locale)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                {t(LABEL_KEYS[page])}
                <Icon name="external" className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </RowTitle>
          </RowMain>
        </Row>
      ))}
    </Section>
  );
}
