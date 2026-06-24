"use client";

import { useEffect, useState } from "react";

import { DodiFullHome } from "@/components/dodi/dodi-full-home";
import { getCookie } from "@/lib/cookies";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";

export default function KidHomePage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    let cancelled = false;
    // Read the active-profile cookie after mount, deferred off the synchronous
    // effect tick (avoids the cascading-render lint and SSR/hydration skew from
    // touching `document` during render).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setProfileId(getCookie("dodi-active-profile") ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Avoid flashing the "no profile" card before the cookie is read.
  if (!ready) return null;

  if (!profileId) {
    return (
      <div className="my-auto w-full max-w-xs rounded-[20px] bg-white p-5 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <p className="text-sm font-bold text-muted-foreground">
          No profile selected
        </p>
      </div>
    );
  }

  return <DodiFullHome profileId={profileId} hasProvider={hasProvider} />;
}
