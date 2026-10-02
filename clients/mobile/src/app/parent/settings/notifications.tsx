import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import {
  notificationPreferencesOf,
  notificationTogglesOf,
  saveNotificationPreferences,
} from "@dodi/client-state/account-settings";
import type { NotificationPreferences } from "@dodi/client-state/account-store";

import { api } from "@/adapters/platform";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Switch, Text } from "@/components/ui";
import { clientState, useAccountStore } from "@/lib/client-state";

/**
 * Notification settings (web: parent/settings/notifications/page): opt in or
 * out of the transactional emails. Toggles save immediately (optimistic).
 */
export default function NotificationsSettingsScreen() {
  const t = useTranslations("settings");
  const prefs = useAccountStore((s) => notificationPreferencesOf(s.account));
  const isLoaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Opt-out: absent reads as on.
  const { isFriendApprovalOn, isPublicationOutcomeOn } = notificationTogglesOf(prefs);

  async function saveToggle(patch: NotificationPreferences): Promise<void> {
    setError(null);
    setIsSaving(true);
    const isSaved = await saveNotificationPreferences({ api, account: clientState.account }, patch);
    if (!isSaved) setError(t("notificationsSaveFailed"));
    setIsSaving(false);
  }

  const isDisabled = !isLoaded || isSaving;
  return (
    <>
      <Section title={t("notificationsEmailTitle")} desc={t("notificationsEmailDescription")}>
        <FieldRow label={t("notifyFriendApproval")} hint={t("notifyFriendApprovalHint")}>
          <Switch
            checked={isFriendApprovalOn}
            disabled={isDisabled}
            onCheckedChange={(next) => void saveToggle({ friend_approval_email: next })}
            accessibilityLabel={t("notifyFriendApproval")}
          />
        </FieldRow>
        <FieldRow label={t("notifyPublicationOutcome")} hint={t("notifyPublicationOutcomeHint")}>
          <Switch
            checked={isPublicationOutcomeOn}
            disabled={isDisabled}
            onCheckedChange={(next) => void saveToggle({ publication_outcome_email: next })}
            accessibilityLabel={t("notifyPublicationOutcome")}
          />
        </FieldRow>
      </Section>
      {error ? (
        <Text className="px-1 text-sm text-danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </>
  );
}
