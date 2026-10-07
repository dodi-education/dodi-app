/**
 * The app's platform ports for the shared client state (`@dodi/client-state`).
 */
import { Storage } from "expo-sqlite/kv-store";
import type { ClientPlatform } from "@dodi/client-state";
import { SEALED_SECRET_TTL_MS } from "@dodi/client-state/platform";
import { DodiClient } from "@dodi/protocol";

import { API_URL, DODI_AI_URL } from "@/lib/env";

import { getAccessToken } from "./auth";
import { createDeviceKeystore } from "./device-keystore";
import { cookielessFetch } from "./http";
import { offlineCache } from "./offline-cache";
import { sealedSecretSlot } from "./sealed-storage";

export const api = new DodiClient({
  baseUrl: API_URL,
  fetch: cookielessFetch,
  auth: { kind: "bearer", getToken: () => getAccessToken() },
});

const ACTIVE_KID_KEY = "dodi-active-kid";
/** Which view the device was last in (web: the `dodi-view` cookie). The kid
 * chrome and the parent shell record it as they mount. */
const VIEW_KEY = "dodi-view";

export type AppView = "kid" | "parent";

/**
 * The view to open on launch: the kid view when the device was last in it
 * (so a kid's cold start, offline included, lands back in the kid view
 * instead of the parent area), else the parent area.
 */
export function readLastView(): AppView {
  return Storage.getItemSync(VIEW_KEY) === "kid" ? "kid" : "parent";
}

export function writeLastView(view: AppView): void {
  Storage.setItemSync(VIEW_KEY, view);
}

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


export const mobilePlatform: ClientPlatform = {
  api,
  getAccessToken,
  dodiAIUrl: DODI_AI_URL,
  fetch: cookielessFetch,
  offlineCache,
  deviceKeystore: createDeviceKeystore(),
  registrationSeal: sealedSecretSlot("registration", SEALED_SECRET_TTL_MS),
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
