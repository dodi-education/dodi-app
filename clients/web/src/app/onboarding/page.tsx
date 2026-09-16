"use client";

/**
 * Onboarding step 2, right after the account key: the account-level basics that
 * are wrong by default for everyone outside en-US — UI language, timezone and
 * the date/time formats. Everything is prefilled (negotiated locale, device
 * timezone), so Continue is a confirmation rather than a chore, and all of it
 * stays editable under Settings → General.
 *
 * Only the vault-setup step routes here, so it is seen once per account. The
 * chosen timezone is sealed with the VaultSession before it is saved: the
 * server never learns the family's zone.
 */
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { DateTimeFields } from "@/components/parent/date-time-fields";
import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { VaultGate } from "@/components/vault/vault-gate";
import { locales, type Locale } from "@/i18n/config";
import { dodi } from "@/lib/api";
import { applyLocale, LOCALE_NAMES } from "@/lib/locale-preference";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  defaultPref,
  type DateStyleId,
  type StoredDatePreferences,
  type TimeStyleId,
} from "@dodi/intl";
import type { Account } from "@dodi/types/database";

export default function OnboardingPage() {
  // Sealing the timezone needs a session; a reload here unlocks silently.
  return (
    <VaultGate>
      <PreferencesStep />
    </VaultGate>
  );
}

function PreferencesStep() {
  const t = useTranslations("onboarding");
  const ts = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const session = useVaultStore((s) => s.session);
  const loadAccount = useAccountStore((s) => s.load);

  const base = defaultPref(locale, "account");
  const [dateStyle, setDateStyle] = useState<DateStyleId>(base.dateStyle);
  const [timeStyle, setTimeStyle] = useState<TimeStyleId>(base.timeStyle);
  const [timeZone, setTimeZone] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm the account cache so the save below can patch it locally.
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  /**
   * Switching the language re-seeds the formats with that language's defaults
   * (German ⇒ 24-hour, DD.MM.YYYY), which is the whole point of asking for the
   * language first. Anything the parent picks afterwards stands.
   */
  function handleLocale(next: Locale) {
    if (next === locale) return;
    const nextBase = defaultPref(next, "account");
    setDateStyle(nextBase.dateStyle);
    setTimeStyle(nextBase.timeStyle);
    applyLocale(next);
    // The intl provider lives in the cached root layout — only a refresh
    // re-renders this page in the new language.
    router.refresh();
  }

  function finish() {
    router.replace("/parent/dashboard");
  }

  async function handleContinue() {
    setError(null);
    setSaving(true);
    try {
      let timeZoneEnc: string | null = null;
      if (timeZone !== "auto") {
        if (!session) throw new Error(ts("dateVaultLocked"));
        timeZoneEnc = session.encryptField(timeZone);
      }
      const datePreferences: StoredDatePreferences = {
        dateStyle,
        timeStyle,
        timeZoneEnc,
      };
      const res = await dodi.request("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datePreferences, language: locale }),
      });
      if (!res.ok) throw new Error(t("saveFailed"));
      useAccountStore.getState().patchLocal({
        date_preferences: datePreferences as Account["date_preferences"],
        language: locale,
      });
      finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{t("prefsTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("prefsDescription")}
        </p>
      </div>

      <Section>
        <FieldRow label={ts("language")} htmlFor="onboarding-language">
          <select
            id="onboarding-language"
            className={fieldSelectClass}
            value={locale}
            onChange={(e) => handleLocale(e.target.value as Locale)}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </FieldRow>

        <DateTimeFields
          dateStyle={dateStyle}
          timeStyle={timeStyle}
          timeZone={timeZone}
          onDateStyle={(v) => setDateStyle((v || base.dateStyle) as DateStyleId)}
          onTimeStyle={(v) => setTimeStyle((v || base.timeStyle) as TimeStyleId)}
          onTimeZone={setTimeZone}
          basePref={base}
        />
      </Section>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={finish} disabled={saving}>
          {t("skip")}
        </Button>
        <Button onClick={() => void handleContinue()} disabled={saving}>
          {saving ? t("saving") : t("continue")}
        </Button>
      </div>
    </div>
  );
}
