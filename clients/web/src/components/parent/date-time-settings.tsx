"use client";

/**
 * Account-level "Date & time" settings: the family default for how dates render
 * across the parent area (and the fallback every kid profile inherits). Styles
 * are saved plaintext; an explicit timezone is sealed with the VaultSession so
 * the server never learns the family's zone.
 */
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { DateTimeFields } from "@/components/parent/date-time-fields";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { useDatePrefStore } from "@/stores/date-pref-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  defaultPref,
  type DateStyleId,
  type StoredDatePreferences,
  type TimeStyleId,
} from "@dodi/intl";

export function DateTimeSettings() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const session = useVaultStore((s) => s.session);
  const accountStored = useDatePrefStore((s) => s.accountStored);
  const loaded = useDatePrefStore((s) => s.loaded);
  const load = useDatePrefStore((s) => s.load);

  const base = defaultPref(locale, "account");
  const [dateStyle, setDateStyle] = useState<DateStyleId>(base.dateStyle);
  const [timeStyle, setTimeStyle] = useState<TimeStyleId>(base.timeStyle);
  const [timeZone, setTimeZone] = useState<string>("auto");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Populate the controls once the stored prefs are available (and the vault is
  // ready, if an explicit timezone needs decrypting). Runs once.
  useEffect(() => {
    if (hydrated || !loaded) return;
    if (accountStored?.timeZoneEnc && !session) return; // wait for the vault
    // Initialize the controls from the loaded account prefs (one-time sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDateStyle(accountStored?.dateStyle ?? base.dateStyle);
    setTimeStyle(accountStored?.timeStyle ?? base.timeStyle);
    let tz = "auto";
    if (accountStored?.timeZoneEnc && session) {
      try {
        tz = session.decryptField(accountStored.timeZoneEnc) ?? "auto";
      } catch {
        tz = "auto";
      }
    }
    setTimeZone(tz);
    setHydrated(true);
  }, [hydrated, loaded, accountStored, session, base.dateStyle, base.timeStyle]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      let timeZoneEnc: string | null = null;
      if (timeZone !== "auto") {
        if (!session) throw new Error(t("dateVaultLocked"));
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
        body: JSON.stringify({ datePreferences }),
      });
      if (!res.ok) throw new Error(t("dateSaveFailed"));
      useDatePrefStore.getState().setAccountStored(datePreferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dateSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title={t("dateTimeTitle")} desc={t("dateTimeDescription")}>
      <DateTimeFields
        dateStyle={dateStyle}
        timeStyle={timeStyle}
        timeZone={timeZone}
        onDateStyle={(v) => setDateStyle((v || base.dateStyle) as DateStyleId)}
        onTimeStyle={(v) => setTimeStyle((v || base.timeStyle) as TimeStyleId)}
        onTimeZone={setTimeZone}
        basePref={base}
      />
      {error && <div className="px-5 py-3 text-sm text-danger">{error}</div>}
      <SaveRow note={saved ? tc("saved") : undefined}>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? tc("loading") : tc("save")}
        </Button>
      </SaveRow>
    </Section>
  );
}
