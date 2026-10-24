"use client";

import { useTranslations } from "next-intl";

import { AgentGrantFields } from "@/components/parent/access/agent-grant-fields";
import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import type { InvitableRole } from "@dodi/client-state/family-members";
import { AGENT_SCOPES, type AgentScope } from "@dodi/protocol/agent-scopes";

interface MemberAccessFieldsProps {
  idPrefix: string;
  role: InvitableRole;
  onRoleChange: (role: InvitableRole) => void;
  scopes: readonly AgentScope[];
  onScopesChange: (scopes: AgentScope[]) => void;
}

/**
 * What another adult may do in the family: everything (co-parent), or only
 * what is switched on (limited, the same choices as for an agent).
 */
export function MemberAccessFields({
  idPrefix,
  role,
  onRoleChange,
  scopes,
  onScopesChange,
}: MemberAccessFieldsProps) {
  const t = useTranslations("access");
  return (
    <>
      <FieldRow
        label={t("memberRole")}
        htmlFor={`${idPrefix}-role`}
        hint={t(role === "co_parent" ? "roleCoParentDesc" : "roleMemberDesc")}
      >
        <select
          id={`${idPrefix}-role`}
          className={fieldSelectClass}
          value={role}
          onChange={(e) => onRoleChange(e.target.value as InvitableRole)}
        >
          <option value="co_parent">{t("roleCoParent")}</option>
          <option value="member">{t("roleMember")}</option>
        </select>
      </FieldRow>
      {role === "member" ? (
        <AgentGrantFields
          idPrefix={idPrefix}
          scopes={AGENT_SCOPES}
          selected={scopes}
          onSelectedChange={onScopesChange}
          audience="member"
        />
      ) : null}
    </>
  );
}
