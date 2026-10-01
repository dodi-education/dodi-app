/**
 * The app's platform ports for the shared client state (`@dodi/client-state`).
 */
import { Storage } from "expo-sqlite/kv-store";
import type { ClientPlatform, OfflineCache } from "@dodi/client-state";
import { DodiClient } from "@dodi/protocol";

import { API_URL, DODI_AI_URL } from "@/lib/env";

import { getAccessToken } from "./auth";
import { createDeviceKeystore } from "./device-keystore";
import { cookielessFetch } from "./http";
import { sealedSlot } from "./sealed-storage";

export const api = new DodiClient({
  baseUrl: API_URL,
  fetch: cookielessFetch,
  auth: { kind: "bearer", getToken: () => getAccessToken() },
});

/**
 * The offline ciphertext cache arrives with the offline kid view (roadmap
 * phase 6). Until then nothing is cached: reads miss, so an offline cold start
 * asks for the password instead of unlocking silently.
 */
const noOfflineCache: OfflineCache = {
  writeVaultKeys: async () => {},
  readVaultKeys: async () => null,
  writeKidRows: async () => {},
  readKidRows: async () => null,
  writeGameRows: async () => {},
  readGameRows: async () => null,
};

const ACTIVE_KID_KEY = "dodi-active-kid";

// Session-scoped state lives with the app process: a cold start re-locks the
// parent area and the kid profiles' avatar PINs.
let isParentUnlocked = false;
let unlockedKidIds = new Set<string>();
const parentLockListeners = new Set<() => void>();

export function getIsParentUnlocked(): boolean {
  return isParentUnlocked;
}

export function subscribeParentLock(listener: () => void): () => void {
  parentLockListeners.add(listener);
  return () => {
    parentLockListeners.delete(listener);
  };
}

function setParentUnlocked(value: boolean): void {
  isParentUnlocked = value;
  parentLockListeners.forEach((listener) => listener());
}

const registrationSlot = sealedSlot("registration");

export const mobilePlatform: ClientPlatform = {
  api,
  getAccessToken,
  dodiAIUrl: DODI_AI_URL,
  fetch: cookielessFetch,
  offlineCache: noOfflineCache,
  deviceKeystore: createDeviceKeystore(),
  registrationSeal: {
    stash: (secret) => registrationSlot.write(secret),
    consume: async () => {
      const secret = await registrationSlot.read();
      await registrationSlot.clear();
      return secret;
    },
    clear: () => registrationSlot.clear(),
  },
  parentLock: {
    markUnlocked: () => setParentUnlocked(true),
    clear: () => setParentUnlocked(false),
  },
  activeKid: {
    readActiveKidId: () => Storage.getItemSync(ACTIVE_KID_KEY),
    writeActiveKid: (kid) => Storage.setItemSync(ACTIVE_KID_KEY, kid.id),
    readUnlockedKidIds: () => new Set(unlockedKidIds),
    writeUnlockedKidIds: (ids) => {
      unlockedKidIds = new Set(ids);
    },
  },
  preferences: {
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
  },
  isInitiallyOnline: true,
};
