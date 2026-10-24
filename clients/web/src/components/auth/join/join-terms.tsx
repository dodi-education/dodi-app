"use client";

import { useLocale, useTranslations } from "next-intl";

import { siteUrl } from "@/lib/site-links";

/** The guardian / terms / privacy consent, as on sign-up. */
export function JoinTerms({ isAccepted, onChange }: { isAccepted: boolean; onChange: (isAccepted: boolean) => void }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const link = (page: "terms" | "privacy") =>
    function TermsLink(chunks: React.ReactNode) {
      return (
        <a href={siteUrl(page, locale)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          {chunks}
        </a>
      );
    };
  return (
    <label className="flex items-start gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={isAccepted}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>{t.rich("termsConsent", { terms: link("terms"), privacy: link("privacy") })}</span>
    </label>
  );
}
