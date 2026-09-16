"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { vaultSetupGuardTarget } from "@/lib/vault-setup-nav";
import { useVaultStore } from "@/stores/vault-store";

export default function VaultSetupPage() {
  const t = useTranslations("vault");
  const router = useRouter();
  const nsec = useVaultStore((s) => s.pendingNsec);
  const acknowledge = useVaultStore((s) => s.acknowledgeNsec);

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // Set before the key is cleared, so the guard below can tell "continuing"
  // apart from "landed here with nothing to show".
  const continued = useRef(false);

  // Direct navigation with no key to show (e.g. refresh after setup) → leave.
  useEffect(() => {
    const target = vaultSetupGuardTarget({
      hasPendingKey: Boolean(nsec),
      hasContinued: continued.current,
    });
    if (target) router.replace(target);
  }, [nsec, router]);

  if (!nsec) return null;

  async function copyKey() {
    if (!nsec) return;
    await navigator.clipboard.writeText(nsec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function finish() {
    continued.current = true;
    acknowledge();
    // Onboarding continues with the account preferences step.
    router.replace("/onboarding");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("saveKeyTitle")}</CardTitle>
          <CardDescription>{t("saveKeyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* The key is one unbroken token: never wrap it. The font size
              tracks the box width (cqi) so all 63 characters sit on a single
              line, down to a readable floor below which the box scrolls. */}
          <div className="@container overflow-x-auto rounded-lg border bg-muted/40 px-4 py-3.5">
            <p className="whitespace-nowrap text-center font-mono text-[clamp(0.65rem,2.5cqi,0.875rem)] leading-relaxed">
              {nsec}
            </p>
          </div>
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
