/**
 * Account-level "Interface" settings (web: parent/interface-settings): toggles
 * for the app on every device of the family. Saved immediately, optimistic.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { saveInterfacePreferences } from "@dodi/client-state/account-settings";
import { interfacePreferencesOf } from "@dodi/client-state/account-store";
import type { InterfacePreferences } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Switch, Text } from "@/components/ui";
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
    <Section title={t("interfaceTitle")} desc={t("interfaceDescription")}>
      <FieldRow label={t("enable3d")} hint={t("enable3dHint")}>
        <Switch
          checked={is3dEnabled}
          disabled={!isLoaded || isSaving}
          onCheckedChange={(next) => void saveToggle({ is_3d_enabled: next })}
          accessibilityLabel={t("enable3d")}
        />
      </FieldRow>
      {error ? (
        <View className="px-5 py-3">
          <Text className="text-sm text-danger" accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : null}
    </Section>
  );
}
