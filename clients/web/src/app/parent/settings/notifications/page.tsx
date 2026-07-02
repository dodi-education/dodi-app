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
import { useNotificationPrefsStore } from "@/stores/notification-prefs-store";

export default function NotificationsSettingsPage() {
  const t = useTranslations("settings");
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const loaded = useNotificationPrefsStore((s) => s.loaded);
  const load = useNotificationPrefsStore((s) => s.load);
  const setPrefs = useNotificationPrefsStore((s) => s.setPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Opt-out: absent/undefined reads as on.
  const friendApproval = prefs?.friend_approval_email !== false;

  async function toggleFriendApproval(next: boolean) {
    setError(null);
    setSaving(true);
    const previous = prefs ?? {};
    setPrefs({ ...previous, friend_approval_email: next }); // optimistic
    try {
      const res = await dodi.request("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationPreferences: { friend_approval_email: next },
        }),
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
            onCheckedChange={toggleFriendApproval}
            aria-label={t("notifyFriendApproval")}
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
