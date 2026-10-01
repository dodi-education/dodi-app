/**
 * Account-level "Interface" settings (web: parent/interface-settings): toggles
 * for the app on every device of the family. Saved immediately, optimistic.
 */
import { useState } from "react";
import { useTranslations } from "use-intl";
import { saveInterfacePreferences } from "@dodi/client-state/account-settings";
import { interfacePreferencesOf } from "@dodi/client-state/account-store";
import type { InterfacePreferences } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { Card, Notice, SwitchRow } from "@/components/ui";
import { clientState, useAccountStore } from "@/lib/client-state";

export function InterfaceSettings() {
  const t = useTranslations("settings");
  const isLoaded = useAccountStore((s) => s.loaded);
  // Opt-out: on unless turned off.
  const is3dEnabled = useAccountStore((s) => interfacePreferencesOf(s.account).is_3d_enabled !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveToggle(patch: InterfacePreferences): Promise<void> {
    setError(null);
    setIsSaving(true);
    const isSaved = await saveInterfacePreferences({ api, account: clientState.account }, patch);
    if (!isSaved) setError(t("interfaceSaveFailed"));
    setIsSaving(false);
  }

  return (
    <Card title={t("interfaceTitle")} description={t("interfaceDescription")}>
      <SwitchRow
        label={t("enable3d")}
        description={t("enable3dHint")}
        value={is3dEnabled}
        disabled={!isLoaded || isSaving}
        onValueChange={(next) => void saveToggle({ is_3d_enabled: next })}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Card>
  );
}
