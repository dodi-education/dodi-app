"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { formAlert } from "@dodi/ui-recipes";

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
import { cn } from "@/lib/utils";

interface PasswordConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** What happens, one line each. */
  consequences: string[];
  confirmLabel: string;
  busyLabel: string;
  /** Runs the action; resolves to an error line, or null when it went through. */
  onConfirm: (password: string) => Promise<string | null>;
}

/**
 * A destructive step that asks for the password again (deleting an account
 * or a profile): consequences, a password field and the error line.
 */
export function PasswordConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  consequences,
  confirmLabel,
  busyLabel,
  onConfirm,
}: PasswordConfirmDialogProps) {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (isBusy) return;
    setPassword("");
    setError(null);
    onClose();
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsBusy(true);
    const failure = await onConfirm(password);
    // On success the caller navigates away; keep the dialog busy until then.
    if (failure === null) return;
    setError(failure);
    setIsBusy(false);
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <form onSubmit={handleConfirm} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
            {consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">{t("deletePasswordLabel")}</Label>
            <PasswordInput
              id="confirm-password"
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
            <Button type="button" variant="outline" onClick={close} disabled={isBusy}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={isBusy || !password}>
              <Icon name="delete" size={15} />
              {isBusy ? busyLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
