/**
 * The browser's instance of the shared client state (`@dodi/client-state`):
 * the platform API with the session bearer, IndexedDB for device keys and the
 * offline ciphertext cache, cookies + sessionStorage for the active kid, and
 * localStorage for device preferences. The stores in `@/stores/*` bind this
 * to React.
 */

// Side effect: in the browser, route Argon2id through a Web Worker so key
// derivation during unlock/wrap never blocks the UI thread.
import "@/lib/argon2-worker";
import { createClientState, type ClientPlatform } from "@dodi/client-state";
import { clientLabelFromUserAgent } from "@dodi/protocol/client-label";
import { createIndexedDbDeviceKeystore } from "@dodi/vault";

import { readActiveKidCookie, writeActiveKidCookies } from "@/lib/active-kid";
import { dodi } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/client";
import { offlineCache } from "@/lib/offline/offline-cache";
import { clearParentUnlocked, markParentUnlocked } from "@/lib/parent-lock";
import {
  clearSealedSecret,
  consumeSealedSecret,
  stashSealedSecret,
} from "@/lib/sealed-secret";

const UNLOCKED_KIDS_KEY = "dodi-kid-unlocked";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** The persisted avatar-PIN unlock set for this tab session (empty under SSR). */
function readUnlockedKidIds(): Set<string> {
  if (!hasWindow()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(UNLOCKED_KIDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeUnlockedKidIds(ids: Set<string>): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(UNLOCKED_KIDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / quota — unlocks degrade to per-page-load.
  }
}

const webPlatform: ClientPlatform = {
  api: dodi,
  getAccessToken,
  dodiAIUrl: process.env.NEXT_PUBLIC_DODI_AI_URL || null,
  // Resolved per call so a fetch installed later (test doubles) is honored.
  fetch: (input, init) => fetch(input, init),
  offlineCache,
  deviceKeystore: createIndexedDbDeviceKeystore(),
  registrationSeal: {
    stash: (secret) => stashSealedSecret(secret),
    consume: () => consumeSealedSecret(),
    clear: () => clearSealedSecret(),
  },
  parentLock: { markUnlocked: markParentUnlocked, clear: clearParentUnlocked },
  activeKid: {
    readActiveKidId: readActiveKidCookie,
    writeActiveKid: (kid) => writeActiveKidCookies({ id: kid.id, language: kid.language ?? "en" }),
    readUnlockedKidIds,
    writeUnlockedKidIds,
  },
  preferences: {
    getItem: (key) => (hasWindow() ? window.localStorage.getItem(key) : null),
    setItem: (key, value) => {
      if (hasWindow()) window.localStorage.setItem(key, value);
    },
  },
  // Only an explicit `false` means offline — node (tests/SSR) has a navigator
  // without `onLine`, and "no signal" must default to online.
  isInitiallyOnline: typeof navigator === "undefined" || navigator.onLine !== false,
  describeClient: () => ({
    kind: "browser",
    label: clientLabelFromUserAgent(typeof navigator === "undefined" ? null : navigator.userAgent),
  }),
};

export const clientState = createClientState(webPlatform);

if (hasWindow()) {
  window.addEventListener("online", () => clientState.connectivity.getState().reportOnline());
  window.addEventListener("offline", () => clientState.connectivity.getState().reportOffline());
}
