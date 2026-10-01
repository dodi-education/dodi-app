import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import {
  notificationPreferencesOf,
  notificationTogglesOf,
  saveNotificationPreferences,
} from "@dodi/client-state/account-settings";
import type { NotificationPreferences } from "@dodi/client-state/account-store";

import { api } from "@/adapters/platform";
import { Card, Notice, Screen, SwitchRow } from "@/components/ui";
import { clientState, useAccountStore } from "@/lib/client-state";

/**
 * Notification settings (web: parent/settings/notifications): opt in or out
 * of the transactional emails. Toggles save immediately (optimistic).
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
    <Screen>
      <Card title={t("notificationsEmailTitle")} description={t("notificationsEmailDescription")}>
        <SwitchRow
          label={t("notifyFriendApproval")}
          description={t("notifyFriendApprovalHint")}
          value={isFriendApprovalOn}
          disabled={isDisabled}
          onValueChange={(next) => void saveToggle({ friend_approval_email: next })}
        />
        <SwitchRow
          label={t("notifyPublicationOutcome")}
          description={t("notifyPublicationOutcomeHint")}
          value={isPublicationOutcomeOn}
          disabled={isDisabled}
          onValueChange={(next) => void saveToggle({ publication_outcome_email: next })}
        />
      </Card>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Screen>
  );
}
