"use client";

import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { LoginForm } from "@/components/auth/login-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The sign-in dialog for the public game page: every conversion surface
 * (header button, intro-card link, action buttons) opens the same dialog via
 * `useLoginDialog()`. Registration stays a full page — it runs OTP, invite
 * and vault-setup steps that don't fit a modal — so the dialog only links out.
 */
interface LoginDialogContextValue {
  openLoginDialog: () => void;
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null);

export function useLoginDialog(): LoginDialogContextValue {
  const ctx = useContext(LoginDialogContext);
  if (!ctx) {
    throw new Error("useLoginDialog must be used inside LoginDialogProvider");
  }
  return ctx;
}

export function LoginDialogProvider({
  next,
  children,
}: {
  /** Same-app path to return to after signing in (the current game page). */
  next?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const tp = useTranslations("publicGames");
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({ openLoginDialog: () => setOpen(true) }),
    [],
  );

  return (
    <LoginDialogContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <span className="flex items-center gap-2">
              <Image
                src="/images/dodi-head-active.png"
                alt=""
                width={36}
                height={36}
              />
              <span className="text-2xl font-bold text-dodi-800">dodi</span>
            </span>
            <DialogTitle>{t("welcomeBack")}</DialogTitle>
            <DialogDescription>{tp("signInToContinue")}</DialogDescription>
          </DialogHeader>
          <LoginForm next={next} />
          <p className="text-center text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              {tc("signUp")}
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </LoginDialogContext.Provider>
  );
}
