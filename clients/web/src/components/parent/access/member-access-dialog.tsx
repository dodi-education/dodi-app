"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { MemberAccessFields } from "@/components/parent/access/member-access-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  updateFamilyMember,
  type FamilyMember,
  type InvitableRole,
} from "@dodi/client-state/family-members";
import { normalizeAgentScopes, type AgentScope } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

interface MemberAccessDialogProps {
  member: FamilyMember | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Change what another adult (not the owner) may do in the family. */
export function MemberAccessDialog({ member, onClose, onSaved }: MemberAccessDialogProps) {
  return (
    <Dialog open={member !== null} onOpenChange={(isOpen) => (isOpen ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {member ? <MemberAccessForm key={member.userId} member={member} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MemberAccessForm({ member, onClose, onSaved }: { member: FamilyMember } & Omit<MemberAccessDialogProps, "member">) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const [role, setRole] = useState<InvitableRole>(member.role === "member" ? "member" : "co_parent");
  const [scopes, setScopes] = useState<AgentScope[]>(() => normalizeAgentScopes(member.scopes));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const isSaved = await updateFamilyMember(dodi, member.userId, { role, scopes });
    setIsSaving(false);
    if (!isSaved) {
      setError(t("memberSaveFailed"));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("memberAccessTitle")}</DialogTitle>
        <DialogDescription>{member.email}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="-mx-6">
        <MemberAccessFields
          idPrefix="member"
          role={role}
          onRoleChange={setRole}
          scopes={scopes}
          onScopesChange={setScopes}
        />
        <div className={cn("flex", access.block)}>
          {error ? (
            <p role="alert" className={access.error}>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" disabled={isSaving} onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="min-h-11" disabled={isSaving || (role === "member" && scopes.length === 0)}>
              {isSaving ? t("memberSaving") : tc("save")}
            </Button>
          </DialogFooter>
        </div>
      </form>
    </>
  );
}
