"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { startOwnFamily } from "@dodi/client-state/family-members";

import { DeleteProfileDialog } from "@/components/parent/profile/delete-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dodi } from "@/lib/api";
import { endSession } from "@/lib/auth/end-session";
import { clientState } from "@/lib/client-state";

/**
 * Shown by the VaultGate when the signed-in profile belongs to no account (it
 * left or was removed, its account was deleted, or it never finished
 * joining): create an account of its own, delete the profile, or sign out. A
 * new account's vault is set up next, like after sign-up.
 */
export function NoFamilyNotice() {
  const t = useTranslations("vault");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  async function start() {
    setIsStarting(true);
    setError(null);
    const outcome = await startOwnFamily({
      api: dodi,
      vault: clientState.vault,
      dropFamilyData: clientState.dropFamilyData,
    });
    if (outcome.kind === "error") {
      setError(t(outcome.key));
      setIsStarting(false);
    }
  }

  async function signOut() {
    await endSession();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("noFamilyTitle")}</CardTitle>
          <CardDescription>{t("noFamilyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="min-h-11 w-full" disabled={isStarting} onClick={() => void start()}>
            {isStarting ? t("startingFamily") : t("startFamily")}
          </Button>
          <Button variant="outline" className="min-h-11 w-full" onClick={() => void signOut()}>
            {tc("signOut")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 w-full text-danger"
            onClick={() => setIsDeleteOpen(true)}
          >
            {t("deleteProfile")}
          </Button>
        </CardContent>
      </Card>
      <DeleteProfileDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} />
    </div>
  );
}
