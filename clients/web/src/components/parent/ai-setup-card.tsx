"use client";

/**
 * Dashboard nudge: until the family has an AI provider — an own key in the
 * vault, or a category running on dodi AI — nothing that needs a model works
 * (no voice, no game creation). Renders nothing once either is in place, and
 * stays invisible while the two sources are still loading so a configured
 * account never sees it flash.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";

export function AiSetupCard() {
  const t = useTranslations("dashboard");
  const session = useVaultStore((s) => s.session);
  const providers = useProvidersStore((s) => s.providers);
  // undefined = still loading; null = no model config saved yet.
  const [config, setConfig] = useState<AccountModelConfig | null | undefined>(
    undefined,
  );

  // Keys are E2EE, so the list only resolves once the vault is unlocked.
  useEffect(() => {
    if (!session || providers !== null) return;
    void useProvidersStore.getState().load().catch(() => {});
  }, [session, providers]);

  useEffect(() => {
    let cancelled = false;
    dodi
      .request("/api/ai/config")
      .then((r) => (r.ok ? (r.json() as Promise<AccountModelConfig | null>) : null))
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (providers === null || config === undefined) return null;

  const hasOwnKey = Object.keys(providers).length > 0;
  const usesDodiAI =
    config !== null &&
    [
      config.voiceProvider,
      config.thinkingProvider,
      config.gameProvider,
      config.imageProvider,
    ].includes("dodi");
  if (hasOwnKey || usesDodiAI) return null;

  return (
    <Section>
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="rounded-lg bg-primary-soft p-2 text-primary">
            <Icon name="ai" className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t("aiSetupTitle")}</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t("aiSetupDescription")}
            </p>
          </div>
        </div>
        <Button asChild className="sm:shrink-0">
          <Link href="/parent/settings/ai-providers">{t("aiSetupCta")}</Link>
        </Button>
      </div>
    </Section>
  );
}
