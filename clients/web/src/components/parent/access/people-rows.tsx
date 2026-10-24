"use client";

import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AGENT_SCOPE_LABEL_KEYS } from "@dodi/client-state/authorized-clients";
import type {
  FamilyMember,
  FamilyOverview,
  PendingInvitation,
} from "@dodi/client-state/family-members";
import { normalizeAgentScopes } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

interface PeopleRowsProps {
  family: FamilyOverview;
  canManage: boolean;
  busyId: string | null;
  onEdit: (member: FamilyMember) => void;
  onRemove: (member: FamilyMember) => void;
  onCancelInvite: (invitation: PendingInvitation) => void;
}

/** The family's people and open invitations, as rows. */
export function PeopleRows({ family, canManage, busyId, onEdit, onRemove, onCancelInvite }: PeopleRowsProps) {
  const t = useTranslations("access");
  const { formatDate } = useDateFormat();

  function scopeList(scopes: readonly string[]): string {
    return normalizeAgentScopes(scopes)
      .map((scope) => t(AGENT_SCOPE_LABEL_KEYS[scope].title))
      .join(", ");
  }

  return (
    <>
      {family.members.map((member) => {
        const isOwner = member.role === "owner";
        const canChange = canManage && !isOwner && !member.isYou;
        const canRemove = !isOwner && (canManage || member.isYou);
        const isBusy = busyId === member.userId;
        return (
          <Row key={member.userId}>
            <div className={cn(access.icon, access.webIcon)}>
              <Icon name="kids" size={16} />
            </div>
            <RowMain>
              <RowTitle>
                {member.email}
                <Badge variant={isOwner ? "blue" : "gray"}>{t(ROLE_KEYS[member.role])}</Badge>
                {member.isYou ? <Badge variant="success">{t("you")}</Badge> : null}
              </RowTitle>
              {member.role === "member" ? <RowMeta>{scopeList(member.scopes)}</RowMeta> : null}
              <RowMeta>{t("joinedOn", { date: formatDate(member.joinedAt) })}</RowMeta>
            </RowMain>
            {canChange ? (
              <Button variant="ghost" size="sm" className="min-h-11" disabled={isBusy} onClick={() => onEdit(member)}>
                {t("changeAccess")}
              </Button>
            ) : null}
            {canRemove ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={isBusy}
                aria-label={`${member.isYou ? t("leaveFamily") : t("removeMember")}: ${member.email}`}
                onClick={() => onRemove(member)}
              >
                {member.isYou ? t("leaveFamily") : t("removeMember")}
              </Button>
            ) : null}
          </Row>
        );
      })}
      {family.invitations.map((invitation) => (
        <Row key={invitation.id}>
          <div className={cn(access.icon, access.webIcon)}>
            <Icon name="send" size={16} />
          </div>
          <RowMain>
            <RowTitle>
              {invitation.invitedEmail}
              <Badge variant="blue">{t("invitePending")}</Badge>
            </RowTitle>
            <RowMeta>
              {t(ROLE_KEYS[invitation.role])}
              {invitation.role === "member" ? (
                <>
                  <DotSep />
                  {scopeList(invitation.scopes)}
                </>
              ) : null}
              <DotSep />
              {t("expiresOn", { date: formatDate(invitation.expiresAt) })}
            </RowMeta>
          </RowMain>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={busyId === invitation.id}
            aria-label={`${t("cancelInvite")}: ${invitation.invitedEmail}`}
            onClick={() => onCancelInvite(invitation)}
          >
            {t("cancelInvite")}
          </Button>
        </Row>
      ))}
    </>
  );
}
