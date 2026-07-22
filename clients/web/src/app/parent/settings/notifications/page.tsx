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
import {
  useAccountStore,
  type NotificationPreferences,
} from "@/stores/account-store";
import type { Account } from "@dodi/types/database";

export default function NotificationsSettingsPage() {
  const t = useTranslations("settings");
  const prefs = useAccountStore(
    (s) =>
      (s.account?.notification_preferences ?? null) as
        | NotificationPreferences
        | null,
  );
  const loaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const setPrefs = (next: NotificationPreferences) =>
    useAccountStore.getState().patchLocal({
      notification_preferences: next as Account["notification_preferences"],
    });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Opt-out: absent/undefined reads as on.
  const friendApproval = prefs?.friend_approval_email !== false;
  const publicationOutcome = prefs?.publication_outcome_email !== false;

  async function saveToggle(patch: NotificationPreferences) {
    setError(null);
    setSaving(true);
    const previous = prefs ?? {};
    setPrefs({ ...previous, ...patch }); // optimistic
    try {
      const res = await dodi.request("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPreferences: patch }),
      });
      if (!res.ok) throw new Error("save_failed");
    } catch {
      setPrefs(previous); // revert on failure
      setError(t("notificationsSaveFailed"));
    } finally {
      setSaving(false);
    }
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
