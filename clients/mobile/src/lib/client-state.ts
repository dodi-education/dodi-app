/**
 * The app's instance of the shared client state, plus React bindings with the
 * same names the web uses (`useVaultStore`, `useKidStore`, …).
 */
import { createClientState } from "@dodi/client-state";
import { bindStore } from "@dodi/client-state/react";

import { mobilePlatform } from "@/adapters/platform";

export const clientState = createClientState(mobilePlatform);

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
