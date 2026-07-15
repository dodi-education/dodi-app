"use client";

import { useEffect, useState } from "react";

import { DodiFullHome } from "@/components/dodi/dodi-full-home";
import { useActiveKid } from "@/hooks/use-active-kid";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";

export default function KidHomePage() {
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
      <div className="my-auto w-full max-w-xs rounded-[20px] bg-white p-5 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <p className="text-sm font-bold text-muted-foreground">
          No kid selected
        </p>
      </div>
    );
  }

  return <DodiFullHome kidId={activeKidId} hasProvider={hasProvider} />;
}
