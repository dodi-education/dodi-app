"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { InviteDialog } from "@/components/parent/access/invite-dialog";
import { MemberAccessDialog } from "@/components/parent/access/member-access-dialog";
import { PeopleRows } from "@/components/parent/access/people-rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/utils";
import { useAccountStore } from "@/stores/account-store";
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

/**
 * Settings > Access > People: who is in the family, open invitations, and
 * (for the owner and co-parents) inviting, changing and removing people.
 * Anyone but the owner can leave.
 */
export function PeopleSection() {
  const t = useTranslations("access");
  const router = useRouter();
  const role = useAccountStore((s) => s.member?.role ?? null);
  const canManage = canManageFamily(role);
  const [family, setFamily] = useState<FamilyOverview | null | "failed">(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);

  const load = useCallback(async () => {
    setFamily((await loadFamily(dodi, { canManage })) ?? "failed");
  }, [canManage]);

  useEffect(() => {
    if (role === null) return;
    void Promise.resolve().then(load);
  }, [load, role]);

  async function act(id: string, run: () => Promise<boolean>, failedKey: string) {
    setError(null);
    setBusyId(id);
    const isDone = await run();
    setBusyId(null);
    if (!isDone) setError(t(failedKey));
    else await load();
  }

  async function remove(member: FamilyMember) {
    if (member.isYou) {
      if (!window.confirm(t("confirmLeave"))) return;
      setBusyId(member.userId);
      const deps = { api: dodi, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };
      if (await leaveFamily(deps, member.userId)) {
        router.push("/parent/dashboard");
        router.refresh();
        return;
      }
      setBusyId(null);
      setError(t("leaveFailed"));
      return;
    }
    if (!window.confirm(t("confirmRemoveMember", { email: member.email }))) return;
    await act(member.userId, () => removeFamilyMember(dodi, member.userId), "removeMemberFailed");
  }

  async function cancel(invitation: PendingInvitation) {
    if (!window.confirm(t("confirmCancelInvite", { email: invitation.invitedEmail }))) return;
    await act(invitation.id, () => cancelFamilyInvite(dodi, invitation.id), "cancelInviteFailed");
  }

  return (
    <>
      <Section
        title={t("peopleTitle")}
        desc={t("peopleDesc")}
        action={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => setIsInviteOpen(true)}>
              <Icon name="add" size={14} />
              {t("inviteTitle")}
            </Button>
          ) : null
        }
      >
        {error ? (
          <p role="alert" className={cn("px-5 pt-4", access.error)}>
            {error}
          </p>
        ) : null}
        {family === null || family === "failed" ? (
          <div className="px-5 py-6">
            <p className={sectionMessage.text}>{family === "failed" ? t("peopleFailed") : t("loading")}</p>
          </div>
        ) : (
          <PeopleRows
            family={family}
            canManage={canManage}
            busyId={busyId}
            onEdit={setEditing}
            onRemove={(member) => void remove(member)}
            onCancelInvite={(invitation) => void cancel(invitation)}
          />
        )}
      </Section>
      <InviteDialog isOpen={isInviteOpen} onOpenChange={setIsInviteOpen} onCreated={() => void load()} />
      <MemberAccessDialog member={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </>
  );
}
