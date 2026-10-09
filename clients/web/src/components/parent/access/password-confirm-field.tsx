"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { access } from "@dodi/ui-recipes";

interface PasswordConfirmFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Why the password is asked for. */
  hint: string;
}

/** The account password that confirms giving a robot or agent a copy of the vault key. */
export function PasswordConfirmField({ id, value, onChange, hint }: PasswordConfirmFieldProps) {
  const t = useTranslations("access");
  const ta = useTranslations("auth");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("password")}</Label>
      <PasswordInput
        id={id}
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        showPasswordLabel={ta("showPassword")}
        hidePasswordLabel={ta("hidePassword")}
      />
      <p id={`${id}-hint`} className={access.note}>
        {hint}
      </p>
    </div>
  );
}
