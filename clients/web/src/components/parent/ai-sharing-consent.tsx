"use client";

import { useLocale, useTranslations } from "next-intl";

import { siteUrl } from "@/lib/site-links";

interface AiSharingConsentProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The provider's display name; null for dodi AI (its providers are named in the copy). */
  providerName: string | null;
}

/**
 * The explicit permission the App Store requires before personal data goes to
 * a third-party AI (guideline 5.1.2(i)): what the provider receives, ticked by
 * the parent before a key is added or dodi AI is turned on.
 */
export function AiSharingConsent({ checked, onCheckedChange, providerName }: AiSharingConsentProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const privacy = (chunks: React.ReactNode) => (
    <a
      href={siteUrl("privacy", locale)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary hover:underline"
    >
      {chunks}
    </a>
  );

  return (
    <label className="flex items-start gap-2 text-[13px] text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        {providerName === null
          ? t.rich("aiSharingConsentManaged", { privacy })
          : t.rich("aiSharingConsent", { provider: providerName, privacy })}
      </span>
    </label>
  );
}
