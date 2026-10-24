import { View } from "react-native";
import { useTranslations } from "use-intl";
import { AGENT_SCOPE_LABEL_KEYS } from "@dodi/client-state/authorized-clients";
import type { FamilyMember, PendingInvitation } from "@dodi/client-state/family-members";
import { normalizeAgentScopes } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

import { DotSep, Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Badge, Button, Icon } from "@/components/ui";
import { useAccountDateFormat } from "@/lib/date-format";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

function useScopeList(): (scopes: readonly string[]) => string {
  const t = useTranslations("access");
  return (scopes) =>
    normalizeAgentScopes(scopes)
      .map((scope) => t(AGENT_SCOPE_LABEL_KEYS[scope].title))
      .join(", ");
}

interface MemberRowProps {
  member: FamilyMember;
  canManage: boolean;
  isBusy: boolean;
  onEdit: (member: FamilyMember) => void;
  onRemove: (member: FamilyMember) => void;
}

/**
 * One person of the family (web: access/people-rows). Separate row
 * components, not a fragment, so the Section draws a divider between each.
 */
export function MemberRow({ member, canManage, isBusy, onEdit, onRemove }: MemberRowProps) {
  const t = useTranslations("access");
  const { formatDate } = useAccountDateFormat();
  const scopeList = useScopeList();
  const isOwner = member.role === "owner";
  const canChange = canManage && !isOwner && !member.isYou;
  const canRemove = !isOwner && (canManage || member.isYou);
  const removeLabel = member.isYou ? t("leaveFamily") : t("removeMember");
  return (
    <Row>
      <View className={access.icon}>
        <Icon name="kids" size={16} color="primary" />
      </View>
      <RowMain>
        <RowTitle>
          <RowTitleText>{member.email}</RowTitleText>
          <Badge variant={isOwner ? "blue" : "gray"}>{t(ROLE_KEYS[member.role])}</Badge>
          {member.isYou ? <Badge variant="success">{t("you")}</Badge> : null}
        </RowTitle>
        {member.role === "member" ? <RowMeta>{scopeList(member.scopes)}</RowMeta> : null}
        <RowMeta>{t("joinedOn", { date: formatDate(member.joinedAt) })}</RowMeta>
      </RowMain>
      {canChange ? (
        <Button variant="ghost" size="sm" disabled={isBusy} onPress={() => onEdit(member)}>
          {t("changeAccess")}
        </Button>
      ) : null}
      {canRemove ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy}
          accessibilityLabel={`${removeLabel}: ${member.email}`}
          onPress={() => onRemove(member)}
        >
          {removeLabel}
        </Button>
      ) : null}
    </Row>
  );
}

/** One open invitation of the family. */
export function InvitationRow({
  invitation,
  isBusy,
  onCancel,
}: {
  invitation: PendingInvitation;
  isBusy: boolean;
  onCancel: (invitation: PendingInvitation) => void;
}) {
  const t = useTranslations("access");
  const { formatDate } = useAccountDateFormat();
  const scopeList = useScopeList();
  return (
    <Row>
      <View className={access.icon}>
        <Icon name="send" size={16} color="primary" />
      </View>
      <RowMain>
        <RowTitle>
          <RowTitleText>{invitation.invitedEmail}</RowTitleText>
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
        disabled={isBusy}
        accessibilityLabel={`${t("cancelInvite")}: ${invitation.invitedEmail}`}
        onPress={() => onCancel(invitation)}
      >
        {t("cancelInvite")}
      </Button>
    </Row>
  );
}
