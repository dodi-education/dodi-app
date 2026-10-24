/**
 * The app's shared client state, wired once per app from its platform ports:
 * the vault, the decrypt-once data caches, AI key resolution and device
 * preferences. Web and mobile bind these vanilla stores to React (see
 * `./react`), so both run the same caching, unlock and E2EE logic.
 */
import { type AccountStore, createAccountStore } from "./account-store";
import { type ActiveKidStore, createActiveKidStore } from "./active-kid-store";
import { type CaptchaStore, createCaptchaStore } from "./captcha-store";
import { awaitSession } from "./await-session";
import { type CompanionVolumeStore, createCompanionVolumeStore } from "./companion-volume-store";
import { type ConnectivityStore, createConnectivityStore } from "./connectivity-store";
import { createDodiAIClient, type DodiAIClient, IS_DODI_AI_OFFERED } from "./dodi-ai";
import { createDodiAIBillingStore, type DodiAIBillingStore } from "./dodi-ai-billing-store";
import { createDodiAIDefaultsStore, type DodiAIDefaultsStore } from "./dodi-ai-defaults-store";
import { createDodiAIKeyStore, type DodiAIKeyStore } from "./dodi-ai-key-store";
import { createGameCrypto, createGameStore, type GameCrypto, type GameStore } from "./game-store";
import { createCompanionStageStore, type CompanionStageStore } from "./companion-stage-store";
import { createCustomTricksStore, type CustomTricksStore } from "./custom-tricks";
import { createCharacterAssetStore, type CharacterAssetStore } from "./character-asset-store";
import { createAssetPublicationStore, type AssetPublicationStore } from "./character-asset-publication";
import { createDiscoverAssetStore, type DiscoverAssetStore } from "./discover-character-assets";
import { createKidStore, type KidStore } from "./kid-store";
import type { ClientPlatform } from "./platform";
import { createProvidersStore, type ProvidersStore } from "./providers-store";
import { createExecutionResolver, type ExecutionResolver } from "./resolve-execution";
import { createVaultStore, type VaultStore } from "./vault-store";
import { watchClientRegistration } from "./authorized-clients";

import type { DeviceKeystore, VaultSession } from "@dodi/vault";

export interface ClientState {
  connectivity: ConnectivityStore;
  vault: VaultStore;
  /** Resolves once the vault is unlocked; rejects when it settles locked. */
  awaitSession(): Promise<VaultSession>;
  account: AccountStore;
  kids: KidStore;
  games: GameStore;
  gameCrypto: GameCrypto;
  providers: ProvidersStore;
  dodiAI: DodiAIClient;
  dodiAIKeys: DodiAIKeyStore;
  dodiAIDefaults: DodiAIDefaultsStore;
  dodiAIBilling: DodiAIBillingStore;
  execution: ExecutionResolver;
  activeKid: ActiveKidStore;
  companionVolume: CompanionVolumeStore;
  /** The companion on screen: Playground state and trick requests. */
  companionStage: CompanionStageStore;
  /** Each companion's custom tricks, opened. */
  customTricks: CustomTricksStore;
  /** The family's own avatars and accessories, opened (files on demand). */
  characterAssets: CharacterAssetStore;
  /** Discover submissions of the family's own assets, per asset. */
  assetPublications: AssetPublicationStore;
  /** Avatars and accessories on Discover (add / remove for the family). */
  discoverAssets: DiscoverAssetStore;
  captcha: CaptchaStore;
  /** This device's identity (its vault wraps are made to it). */
  deviceKeystore: DeviceKeystore;
  /**
   * Forget the family in use: lock the vault, drop every decrypted cache and
   * wipe the offline cache. Before signing out, and when this device moves to
   * another family (switching, joining, leaving), so nothing of one family
   * ever shows in another's session.
   */
  dropFamilyData(): Promise<void>;
}

export function createClientState(platform: ClientPlatform): ClientState {
  const { api, offlineCache } = platform;
  const connectivity = createConnectivityStore(platform.isInitiallyOnline);
  const vault = createVaultStore({
    api,
    deviceKeystore: platform.deviceKeystore,
    offlineCache,
    registrationSeal: platform.registrationSeal,
    parentLock: platform.parentLock,
    connectivity,
  });
  // Browsers and the app appear under Access once they hold a vault wrap.
  watchClientRegistration({
    api,
    vault,
    deviceKeystore: platform.deviceKeystore,
    describe: () => platform.describeClient(),
  });
  const dataDeps = { api, offlineCache, vault, connectivity };
  const providers = createProvidersStore(api, vault);
  const dodiAI = createDodiAIClient({
    // Not offered (open beta): no URL, the self-host behaviour everywhere.
    url: IS_DODI_AI_OFFERED ? platform.dodiAIUrl : null,
    fetch: platform.fetch,
    getAccessToken: platform.getAccessToken,
  });
  const dodiAIKeys = createDodiAIKeyStore(dodiAI);
  const dodiAIDefaults = createDodiAIDefaultsStore(api);
  const account = createAccountStore(api);
  const characterAssets = createCharacterAssetStore({ api, vault });
  const kids = createKidStore(dataDeps);
  const games = createGameStore(dataDeps);
  const dodiAIBilling = createDodiAIBillingStore(dodiAI);
  const customTricks = createCustomTricksStore({ api, vault });
  const assetPublications = createAssetPublicationStore({ api, account, characterAssets });
  const discoverAssets = createDiscoverAssetStore({ api, characterAssets });

  const dropFamilyData = async (): Promise<void> => {
    vault.getState().lock();
    account.getState().reset();
    kids.getState().invalidate();
    games.getState().invalidate();
    providers.getState().invalidate();
    customTricks.getState().invalidate();
    characterAssets.getState().invalidate();
    assetPublications.getState().reset();
    discoverAssets.getState().invalidate();
    dodiAIKeys.getState().clear();
    dodiAIBilling.getState().clear();
    // Persisted ciphertext rows and the sealed vault keys are this family's.
    await offlineCache.clearAll();
  };

  return {
    connectivity,
    vault,
    awaitSession: () => awaitSession(vault),
    account,
    kids,
    games,
    gameCrypto: createGameCrypto(vault),
    providers,
    dodiAI,
    dodiAIKeys,
    dodiAIDefaults,
    dodiAIBilling,
    execution: createExecutionResolver({ api, dodiAI, dodiAIDefaults, dodiAIKeys, providers }),
    activeKid: createActiveKidStore(platform.activeKid),
    companionVolume: createCompanionVolumeStore(platform.preferences),
    companionStage: createCompanionStageStore(),
    customTricks,
    characterAssets,
    assetPublications,
    discoverAssets,
    captcha: createCaptchaStore(api),
    deviceKeystore: platform.deviceKeystore,
    dropFamilyData,
  };
}
