"use client";

/**
 * Account-level "Interface" settings: look-and-feel toggles for the app on
 * every device of the family. Toggles save immediately (optimistic) via
 * PATCH /api/account; the server merges them into interface_preferences.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Switch } from "@/components/ui/switch";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { useAccountStore, useIs3dEnabled } from "@/stores/account-store";
import { saveInterfacePreferences } from "@dodi/client-state/account-settings";
import type { InterfacePreferences } from "@dodi/types/database";

export function InterfaceSettings() {
  const t = useTranslations("settings");
  const loaded = useAccountStore((s) => s.loaded);
  const is3dEnabled = useIs3dEnabled();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveToggle(patch: InterfacePreferences) {
    setError(null);
    setSaving(true);
    // Optimistic; reverted when the save fails.
    const isSaved = await saveInterfacePreferences(
      { api: dodi, account: clientState.account },
      patch,
    );
    if (!isSaved) setError(t("interfaceSaveFailed"));
    setSaving(false);
  }

  return (
    <Section title={t("interfaceTitle")} desc={t("interfaceDescription")}>
      <FieldRow label={t("enable3d")} hint={t("enable3dHint")} htmlFor="enable-3d">
        <Switch
          id="enable-3d"
          checked={is3dEnabled}
          disabled={!loaded || saving}
          onCheckedChange={(next) => saveToggle({ is_3d_enabled: next })}
          aria-label={t("enable3d")}
        />
      </FieldRow>
      {error ? (
        <p className="px-5 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  );
}
