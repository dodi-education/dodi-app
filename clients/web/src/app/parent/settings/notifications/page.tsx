"use client";

/**
 * Notifications settings: opt in/out of the transactional emails dodi sends.
 * Toggles save immediately (optimistic) via PATCH /api/account. Built to hold
 * more notification types as they're added — today it's friend-request approval.
 */
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Switch } from "@/components/ui/switch";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { useAccountStore, type NotificationPreferences } from "@/stores/account-store";
import {
  notificationPreferencesOf,
  notificationTogglesOf,
  saveNotificationPreferences,
} from "@dodi/client-state/account-settings";

export default function NotificationsSettingsPage() {
  const t = useTranslations("settings");
  const prefs = useAccountStore((s) => notificationPreferencesOf(s.account));
  const loaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Opt-out: absent/undefined reads as on.
  const { isFriendApprovalOn: friendApproval, isPublicationOutcomeOn: publicationOutcome } =
    notificationTogglesOf(prefs);

  async function saveToggle(patch: NotificationPreferences) {
    setError(null);
    setSaving(true);
    // Optimistic; reverted when the save fails.
    const isSaved = await saveNotificationPreferences(
      { api: dodi, account: clientState.account },
      patch,
    );
    if (!isSaved) setError(t("notificationsSaveFailed"));
    setSaving(false);
  }

  return (
    <div>
      <Section
        title={t("notificationsEmailTitle")}
        desc={t("notificationsEmailDescription")}
      >
        <FieldRow
          label={t("notifyFriendApproval")}
          hint={t("notifyFriendApprovalHint")}
          htmlFor="notify-friend-approval"
        >
          <Switch
            id="notify-friend-approval"
            checked={friendApproval}
            disabled={!loaded || saving}
            onCheckedChange={(next) =>
              saveToggle({ friend_approval_email: next })
            }
            aria-label={t("notifyFriendApproval")}
          />
        </FieldRow>
        <FieldRow
          label={t("notifyPublicationOutcome")}
          hint={t("notifyPublicationOutcomeHint")}
          htmlFor="notify-publication-outcome"
        >
          <Switch
            id="notify-publication-outcome"
            checked={publicationOutcome}
            disabled={!loaded || saving}
            onCheckedChange={(next) =>
              saveToggle({ publication_outcome_email: next })
            }
            aria-label={t("notifyPublicationOutcome")}
          />
        </FieldRow>
      </Section>
      {error ? (
        <p className="px-1 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
