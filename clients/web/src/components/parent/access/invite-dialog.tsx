"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { CopyButton } from "@/components/parent/access/copy-button";
import { MemberAccessFields } from "@/components/parent/access/member-access-fields";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/utils";
import {
  createFamilyInvite,
  inviteMailtoHref,
  type InvitableRole,
} from "@dodi/client-state/family-members";
import type { AgentScope } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

interface InviteDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: () => void;
}

/**
 * Invite another adult. This browser seals the family's key for a one-time
 * link and shows it: the parent sends it themselves (their mail app, or
 * copied into any chat). dodi never sends it, so dodi never sees the secret.
 */
export function InviteDialog({ isOpen, onOpenChange, onCreated }: InviteDialogProps) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const { formatDate } = useDateFormat();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("co_parent");
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; expiresAt: string } | null>(null);

  function handleOpenChange(next: boolean) {
    if (isCreating) return;
    if (!next) {
      setEmail("");
      setRole("co_parent");
      setScopes([]);
      setError(null);
      setInvite(null);
    }
    onOpenChange(next);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsCreating(true);
    const outcome = await createFamilyInvite(
      { api: dodi, vault: clientState.vault },
      { email, role, scopes, appUrl: window.location.origin },
    );
    setIsCreating(false);
    if (outcome.kind === "error") {
      setError(t(outcome.key));
      return;
    }
    setInvite({ link: outcome.link, expiresAt: outcome.expiresAt });
    onCreated();
  }

  const mailto = invite
    ? inviteMailtoHref({
        to: email.trim(),
        subject: t("inviteMailSubject"),
        body: t("inviteMailBody", { link: invite.link, date: formatDate(invite.expiresAt) }),
      })
    : "";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>
            {invite ? t("inviteCreated", { email: email.trim() }) : t("inviteDesc")}
          </DialogDescription>
        </DialogHeader>
        {invite ? (
          <div className={cn("flex", access.block, "px-0")}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label={t("inviteLink")}
                value={invite.link}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono"
              />
              <CopyButton text={invite.link} label={t("inviteLink")} />
            </div>
            <Button asChild className="min-h-11">
              <a href={mailto}>
                <Icon name="send" size={16} />
                {t("inviteSendEmail")}
              </a>
            </Button>
            <p role="note" className={cn("flex items-start gap-1.5", access.warning)}>
              <Icon name="alert" size={16} />
              <span>{t("inviteLinkWarning", { date: formatDate(invite.expiresAt) })}</span>
            </p>
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => handleOpenChange(false)}>
                {t("keyDone")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={create} className="-mx-6">
            <div className={cn("flex", access.block)}>
              <Label htmlFor="invite-email">{t("inviteEmail")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <MemberAccessFields
              idPrefix="invite"
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
                <Button type="button" variant="outline" className="min-h-11" disabled={isCreating} onClick={() => handleOpenChange(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={isCreating || !email.trim() || (role === "member" && scopes.length === 0)}
                >
                  {isCreating ? t("inviteCreating") : t("inviteCreate")}
                </Button>
              </DialogFooter>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
