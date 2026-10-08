"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { formAlert } from "@dodi/ui-recipes";
import { deleteAccount } from "@dodi/client-state/account-deletion";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
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
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { dodi } from "@/lib/api";
import { endSession, wipeDeviceData } from "@/lib/auth/end-session";
import { isDodiAIConfigured } from "@/lib/dodi-ai";
import { cn } from "@/lib/utils";

const CONSEQUENCE_KEYS = [
  "deleteAccountConsequenceData",
  "deleteAccountConsequenceDiscover",
  "deleteAccountConsequenceFriends",
] as const;

/**
 * Settings > General > Delete account: the in-app deletion both app stores
 * require. The platform re-checks the password and erases the account with
 * all family data; this browser is then signed out and wiped.
 */
export function DeleteAccount() {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (isDeleting) return;
    setIsOpen(false);
    setPassword("");
    setError(null);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsDeleting(true);
    const outcome = await deleteAccount({ api: dodi }, password);
    if (outcome.kind === "deleted") {
      await endSession();
      await wipeDeviceData();
      router.push("/login?deleted=1");
      router.refresh();
      return;
    }
    setError(t(outcome.key));
    setIsDeleting(false);
  }

  return (
    <>
      <Section title={t("deleteAccountTitle")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteAccountRowTitle")}</RowTitle>
            <RowMeta>{t("deleteAccountRowMeta")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={() => setIsOpen(true)}>
            <Icon name="delete" size={14} />
            {t("deleteAccountButton")}
          </Button>
        </Row>
      </Section>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("deleteAccountDialogTitle")}</DialogTitle>
              <DialogDescription>{t("deleteAccountDialogDescription")}</DialogDescription>
            </DialogHeader>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
              {CONSEQUENCE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
              {/* Credits exist only where dodi AI is offered. */}
              {isDodiAIConfigured() ? <li>{t("deleteAccountConsequenceCredits")}</li> : null}
            </ul>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-account-password">{t("deleteAccountPasswordLabel")}</Label>
              <PasswordInput
                id="delete-account-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setError(null);
                  setPassword(e.target.value);
                }}
                showPasswordLabel={ta("showPassword")}
                hidePasswordLabel={ta("hidePassword")}
                required
              />
            </div>
            {error && (
              <div role="alert" className={cn(formAlert.box, formAlert.text)}>
                {error}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={isDeleting}>
                {tc("cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={isDeleting || !password}>
                <Icon name="delete" size={15} />
                {isDeleting ? t("deleteAccountDeleting") : t("deleteAccountConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
