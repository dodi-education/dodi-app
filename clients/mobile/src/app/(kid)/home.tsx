import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { refreshKidHome } from "@dodi/client-state/kid-view";
import { kidHomeEmpty } from "@dodi/ui-recipes";

import { DodiFullHome } from "@/components/dodi/dodi-full-home";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { clientState, useProvidersStore, useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { companionSession } from "@/lib/companion-session";
import { useRefreshOnPull } from "@/lib/refresh-scope";
import { useActiveKid } from "@/lib/use-active-kid";

/** The kid home (web: app/(kid)/home/page): dodi's stage for the active kid. */
export default function KidHomeScreen() {
  const t = useTranslations("kid");
  const { kids, activeKidId, needsPin } = useActiveKid();
  const [hasProvider, setHasProvider] = useState(false);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    // Providers are E2EE: only readable once the vault session exists.
    if (!session) return;
    let isCancelled = false;
    useProvidersStore
      .getState()
      .load()
      .then((providers) => {
        if (!isCancelled) setHasProvider(Object.keys(providers).length > 0);
      })
      .catch(() => {
        if (!isCancelled) setHasProvider(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [session]);

  // Pull to refresh: the provider keys past the cache, and a retry when dodi
  // is stuck in its connection error (the kid chrome reloads the kid list).
  useRefreshOnPull(
    "kid-home",
    activeKidId && !needsPin
      ? async () => {
          const next = await refreshKidHome(
            { providers: clientState.providers, companion: companionSession.store },
            activeKidId,
          );
          if (next !== null) setHasProvider(next);
        }
      : null,
  );

  // While kids load, or while the active profile is PIN-locked, render nothing.
  if (kids === null || needsPin) return null;

  if (!activeKidId) {
    return (
      <View className={kidHomeEmpty.box} style={kidShadowStyle("row")}>
        <KidText className={cn(kidHomeEmpty.text, kidHomeEmpty.textAlign)}>{t("noKidSelected")}</KidText>
      </View>
    );
  }

  return <DodiFullHome kidId={activeKidId} hasProvider={hasProvider} />;
}
