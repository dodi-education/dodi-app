import { useTranslations } from "use-intl";
import type { InvitableRole } from "@dodi/client-state/family-members";
import { AGENT_SCOPES, type AgentScope } from "@dodi/protocol/agent-scopes";
import { fieldRow, section } from "@dodi/ui-recipes";

import { FieldRow } from "@/components/parent/rows";
import { Select, Text } from "@/components/ui";

import { AgentGrantFields } from "./agent-grant-fields";

interface MemberAccessFieldsProps {
  role: InvitableRole;
  onRoleChange: (role: InvitableRole) => void;
  scopes: readonly AgentScope[];
  onScopesChange: (scopes: AgentScope[]) => void;
}

/**
 * What another adult may do in the family (web: access/member-access-fields):
 * everything (co-parent), or only what is switched on (limited, the same
 * choices as for an agent).
 */
export function MemberAccessFields({ role, onRoleChange, scopes, onScopesChange }: MemberAccessFieldsProps) {
  const t = useTranslations("access");
  return (
    <>
      <FieldRow
        label={t("memberRole")}
        className={section.divider}
        hint={<Text className={fieldRow.hint}>{t(role === "co_parent" ? "roleCoParentDesc" : "roleMemberDesc")}</Text>}
      >
        <Select
          label={t("memberRole")}
          value={role}
          options={[
            { value: "co_parent", label: t("roleCoParent") },
            { value: "member", label: t("roleMember") },
          ]}
          onValueChange={(value) => onRoleChange(value as InvitableRole)}
        />
      </FieldRow>
      {role === "member" ? (
        <AgentGrantFields
          scopes={AGENT_SCOPES}
          selected={scopes}
          onSelectedChange={onScopesChange}
          audience="member"
        />
      ) : null}
    </>
  );
}
