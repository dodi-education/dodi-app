/**
 * The app's instance of the shared client state, plus React bindings with the
 * same names the web uses (`useVaultStore`, `useKidStore`, …).
 */
import { useMemo } from "react";
import { AppState } from "react-native";
import { createClientState } from "@dodi/client-state";
import type { ParentAccess } from "@dodi/client-state/parent-nav";
import { bindStore } from "@dodi/client-state/react";
import { startReconnectProbe } from "@dodi/client-state/reconnect-probe";

import { api, mobilePlatform } from "@/adapters/platform";

export const clientState = createClientState(mobilePlatform);

// The app has no trustworthy "online" event (web: window online/offline). The
// stores report fetch outcomes, and while they say offline a cheap platform
// request checks for the network on an interval and on every return to the
// foreground; its first answer flips connectivity back online, which flushes
// the outboxes and re-warms the offline cache.
export const reconnectProbe = startReconnectProbe({
  connectivity: clientState.connectivity,
  probe: () => api.request("/api/health"),
});
AppState.addEventListener("change", (state) => {
  if (state === "active") reconnectProbe.check();
});

export const useVaultStore = bindStore(clientState.vault);
export const useAccountStore = bindStore(clientState.account);
export const useKidStore = bindStore(clientState.kids);
export const useGameStore = bindStore(clientState.games);
export const useProvidersStore = bindStore(clientState.providers);
export const useDodiAIKeyStore = bindStore(clientState.dodiAIKeys);
export const useDodiAIDefaultsStore = bindStore(clientState.dodiAIDefaults);
export const useDodiAIBillingStore = bindStore(clientState.dodiAIBilling);
export const useConnectivityStore = bindStore(clientState.connectivity);
export const useActiveKidStore = bindStore(clientState.activeKid);
export const useCaptchaStore = bindStore(clientState.captcha);
export const useCompanionVolumeStore = bindStore(clientState.companionVolume);
export const useCompanionStageStore = bindStore(clientState.companionStage);
export const useCustomTricksStore = bindStore(clientState.customTricks);
export const useCharacterAssetStore = bindStore(clientState.characterAssets);
export const useAssetPublicationStore = bindStore(clientState.assetPublications);
export const useDiscoverAssetStore = bindStore(clientState.discoverAssets);

const NO_SCOPES: readonly string[] = [];

/** The signed-in person's role and scopes (what the parent area shows them; web: stores/account-store). */
export function useParentAccess(): ParentAccess {
  const role = useAccountStore((s) => s.member?.role ?? null);
  const scopes = useAccountStore((s) => s.member?.scopes ?? NO_SCOPES);
  return useMemo(() => ({ role, scopes }), [role, scopes]);
}
