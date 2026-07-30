"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useVaultStore } from "@/stores/vault-store";

export default function VaultSetupPage() {
  const t = useTranslations("vault");
  const router = useRouter();
  const nsec = useVaultStore((s) => s.pendingNsec);
  const acknowledge = useVaultStore((s) => s.acknowledgeNsec);

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Direct navigation with no key to show (e.g. refresh after setup) → leave.
  useEffect(() => {
    if (!nsec) router.replace("/parent/dashboard");
  }, [nsec, router]);

  if (!nsec) return null;

  async function copyKey() {
    if (!nsec) return;
    await navigator.clipboard.writeText(nsec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function finish() {
    acknowledge();
    router.replace("/parent/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("saveKeyTitle")}</CardTitle>
          <CardDescription>{t("saveKeyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="rounded-lg border bg-muted/40 p-4 font-mono text-sm [overflow-wrap:anywhere]">
            {nsec}
          </p>
          <Button variant="outline" onClick={() => void copyKey()}>
            {copied ? t("keyCopied") : t("copyKey")}
          </Button>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>{t("savedItConfirm")}</span>
          </label>
          <Button onClick={finish} disabled={!saved} className="w-full">
            {t("continue")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
