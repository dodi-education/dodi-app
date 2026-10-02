"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { kidHomeEmpty } from "@dodi/ui-recipes";

import { DodiFullHome } from "@/components/dodi/dodi-full-home";
import { useActiveKid } from "@/hooks/use-active-kid";
import { cn } from "@/lib/utils";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";

export default function KidHomePage() {
  const t = useTranslations("kid");
  // Reactive active kid: resolves the first-available profile on a cold entry
  // and updates on switch, so this no longer races the switcher's cookie write.
  const { kids, activeKidId, needsPin } = useActiveKid();
  const [hasProvider, setHasProvider] = useState(false);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    // Providers are E2EE — only readable once the vault session exists (the kid
    // layout silently unlocks on load). Re-run when the vault unlocks so we
    // don't get stuck reporting "no provider" before the key is ready.
    if (!session) return;
    let cancelled = false;
    useProvidersStore
      .getState()
      .load()
      .then((providers) => {
        if (!cancelled) setHasProvider(Object.keys(providers).length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasProvider(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // While kids load, or when the active profile is PIN-locked (the layout shows
  // the switcher puzzle), render nothing so dodi doesn't initialize early.
  if (kids === null || needsPin) return null;

  if (!activeKidId) {
    return (
      <div className={cn(kidHomeEmpty.box, kidHomeEmpty.web)}>
        <p className={kidHomeEmpty.text}>
          {t("noKidSelected")}
        </p>
      </div>
    );
  }

  return <DodiFullHome kidId={activeKidId} hasProvider={hasProvider} />;
}
