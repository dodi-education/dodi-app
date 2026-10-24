// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { useMemo } from "react";

import { bindStore } from "@dodi/client-state/react";
import type { ParentAccess } from "@dodi/client-state/parent-nav";

import { clientState } from "@/lib/client-state";

import {
  gameScreenshotServiceOf,
  interfacePreferencesOf,
  is3dPreferenceOf,
  patchGameScreenshotService as patchScreenshotService,
  patchInterfacePreferences as patchPreferences,
} from "@dodi/client-state";
import type { GameScreenshotServiceSettings, InterfacePreferences } from "@dodi/types/database";

export type { NotificationPreferences } from "@dodi/client-state";
export { gameScreenshotServiceOf, interfacePreferencesOf };

/** One `/api/account` fetch shared by every consumer; sensitive fields stay sealed. */
export const useAccountStore = bindStore(clientState.account);

/** Mirror a saved screenshot-service choice into the cached account. */
export function patchGameScreenshotService(settings: GameScreenshotServiceSettings): void {
  patchScreenshotService(clientState.account, settings);
}

/** Mirror saved interface toggles into the cached account. */
export function patchInterfacePreferences(prefs: InterfacePreferences): void {
  patchPreferences(clientState.account, prefs);
}

const NO_SCOPES: readonly string[] = [];

/** The signed-in person's role and scopes (what the parent area shows them). */
export function useParentAccess(): ParentAccess {
  const role = useAccountStore((s) => s.member?.role ?? null);
  const scopes = useAccountStore((s) => s.member?.scopes ?? NO_SCOPES);
  return useMemo(() => ({ role, scopes }), [role, scopes]);
}

/** Whether dodi renders as the 3D character. Opt-out: on unless turned off. */
export function useIs3dEnabled(): boolean {
  return useAccountStore((s) => interfacePreferencesOf(s.account).is_3d_enabled !== false);
}

/** The 3D setting for showing the companion: null while the account loads (decide, don't guess). */
export function use3dPreference(): boolean | null {
  return useAccountStore(is3dPreferenceOf);
}
