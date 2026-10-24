import { useState } from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import { useTranslations } from "use-intl";
import {
  updateFamilyMember,
  type FamilyMember,
  type InvitableRole,
} from "@dodi/client-state/family-members";
import { normalizeAgentScopes, type AgentScope } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Button, Dialog, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { MemberAccessFields } from "./member-access-fields";

interface MemberAccessDialogProps {
  member: FamilyMember | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Change what another adult (not the owner) may do in the family (web: access/member-access-dialog). */
export function MemberAccessDialog({ member, onClose, onSaved }: MemberAccessDialogProps) {
  return member ? (
    <MemberAccessForm key={member.userId} member={member} onClose={onClose} onSaved={onSaved} />
  ) : null;
}

function MemberAccessForm({ member, onClose, onSaved }: { member: FamilyMember } & Omit<MemberAccessDialogProps, "member">) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const { height } = useWindowDimensions();
  const [role, setRole] = useState<InvitableRole>(member.role === "member" ? "member" : "co_parent");
  const [scopes, setScopes] = useState<AgentScope[]>(() => normalizeAgentScopes(member.scopes));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setIsSaving(true);
    setError(null);
    const isSaved = await updateFamilyMember(api, member.userId, { role, scopes });
    setIsSaving(false);
    if (!isSaved) {
      setError(t("memberSaveFailed"));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog
      isOpen
      onClose={() => (isSaving ? null : onClose())}
      title={t("memberAccessTitle")}
      description={member.email}
      footer={
        <>
          <Button disabled={isSaving || (role === "member" && scopes.length === 0)} onPress={() => void save()}>
            {isSaving ? t("memberSaving") : tc("save")}
          </Button>
          <Button variant="outline" disabled={isSaving} onPress={onClose}>
            {tc("cancel")}
          </Button>
        </>
      }
    >
      <ScrollView className="-mx-6" style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
        <MemberAccessFields role={role} onRoleChange={setRole} scopes={scopes} onScopesChange={setScopes} />
        {error ? (
          <Text className={cn("px-5 pt-3", access.error)} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Dialog>
  );
}
