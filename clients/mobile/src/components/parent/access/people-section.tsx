import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  cancelFamilyInvite,
  canManageFamily,
  leaveFamily,
  loadFamily,
  removeFamilyMember,
  type FamilyMember,
  type FamilyOverview,
  type PendingInvitation,
} from "@dodi/client-state/family-members";
import { access, sectionMessage } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Section } from "@/components/parent/section";
import { Button, Dialog, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { clientState, useAccountStore } from "@/lib/client-state";
import { useRefreshOnPull } from "@/lib/refresh-scope";

import { InviteDialog } from "./invite-dialog";
import { MemberAccessDialog } from "./member-access-dialog";
import { InvitationRow, MemberRow } from "./people-rows";

type Confirm =
  | { kind: "remove"; member: FamilyMember }
  | { kind: "cancel"; invitation: PendingInvitation };

/**
 * Settings > Access > People (web: access/people-section): who is in the
 * family, open invitations, and (for the owner and co-parents) inviting,
 * changing and removing people. Anyone but the owner can leave.
 */
export function PeopleSection() {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const router = useRouter();
  const role = useAccountStore((s) => s.member?.role ?? null);
  const canManage = canManageFamily(role);
  const [family, setFamily] = useState<FamilyOverview | null | "failed">(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    setFamily((await loadFamily(api, { canManage })) ?? "failed");
  }, [canManage]);
  useRefreshOnPull("people", load);

  useEffect(() => {
    if (role === null) return;
    void Promise.resolve().then(load);
  }, [load, role]);

  async function act(id: string, run: () => Promise<boolean>, failedKey: string): Promise<void> {
    setError(null);
    setBusyId(id);
    const isDone = await run();
    setBusyId(null);
    if (!isDone) setError(t(failedKey));
    else await load();
  }

  async function runConfirmed(): Promise<void> {
    const current = confirm;
    setConfirm(null);
    if (!current) return;
    if (current.kind === "cancel") {
      const { invitation } = current;
      await act(invitation.id, () => cancelFamilyInvite(api, invitation.id), "cancelInviteFailed");
      return;
    }
    const { member } = current;
    if (!member.isYou) {
      await act(member.userId, () => removeFamilyMember(api, member.userId), "removeMemberFailed");
      return;
    }
    setBusyId(member.userId);
    const deps = { api, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };
    if (await leaveFamily(deps, member.userId)) {
      router.replace("/parent/dashboard");
      return;
    }
    setBusyId(null);
    setError(t("leaveFailed"));
  }

  const confirmText =
    confirm?.kind === "cancel"
      ? t("confirmCancelInvite", { email: confirm.invitation.invitedEmail })
      : confirm?.member.isYou
        ? t("confirmLeave")
        : confirm
          ? t("confirmRemoveMember", { email: confirm.member.email })
          : "";
  const confirmLabel =
    confirm?.kind === "cancel" ? t("cancelInvite") : confirm?.member.isYou ? t("leaveFamily") : t("removeMember");

  return (
    <>
      <Section
        title={t("peopleTitle")}
        desc={t("peopleDesc")}
        action={
          canManage ? (
            <Button variant="outline" size="sm" icon="add" onPress={() => setIsInviteOpen(true)}>
              {t("inviteTitle")}
            </Button>
          ) : null
        }
      >
        {error ? (
          <Text accessibilityRole="alert" className={cn("px-5 pt-4", access.error)}>
            {error}
          </Text>
        ) : null}
        {family === null || family === "failed" ? (
          <View className="px-5 py-6">
            <Text className={sectionMessage.text}>{family === "failed" ? t("peopleFailed") : t("loading")}</Text>
          </View>
        ) : null}
        {family && family !== "failed"
          ? family.members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                canManage={canManage}
                isBusy={busyId === member.userId}
                onEdit={setEditing}
                onRemove={(next) => setConfirm({ kind: "remove", member: next })}
              />
            ))
          : null}
        {family && family !== "failed"
          ? family.invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                isBusy={busyId === invitation.id}
                onCancel={(next) => setConfirm({ kind: "cancel", invitation: next })}
              />
            ))
          : null}
      </Section>
      <InviteDialog isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} onCreated={() => void load()} />
      <MemberAccessDialog member={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      {/* web: window.confirm */}
      <Dialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirmLabel}
        description={confirmText}
        footer={
          <>
            <Button variant="destructive" onPress={() => void runConfirmed()}>
              {confirmLabel}
            </Button>
            <Button variant="outline" onPress={() => setConfirm(null)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}
