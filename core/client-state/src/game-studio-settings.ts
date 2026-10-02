/**
 * Game Studio settings: which screenshot service, if any, the build agent may
 * use to look at real frames of a game (the one place game code leaves the
 * device). `mode` saves plaintext (the platform enforces it); a custom URL is
 * sealed with the VaultSession so the server never learns the family's
 * endpoint.
 */
import { isAllowedCustomServiceUrl } from "@dodi/games/screenshot-contract";
import type { Account, GameScreenshotServiceMode, GameScreenshotServiceSettings } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { patchAccount } from "./account-settings";
import { gameScreenshotServiceOf, patchGameScreenshotService, type AccountStore } from "./account-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface ScreenshotServiceDraft {
  mode: GameScreenshotServiceMode;
  customUrl: string;
}

/**
 * The form's initial values from the loaded account, or null while a sealed
 * custom URL still waits for the vault.
 */
export function initialScreenshotService(
  account: Account | null,
  session: VaultSession | null,
): ScreenshotServiceDraft | null {
  const stored = gameScreenshotServiceOf(account);
  if (stored.customUrlEnc && !session) return null;
  let customUrl = "";
  if (stored.customUrlEnc && session) {
    try {
      customUrl = session.decryptField(stored.customUrlEnc) ?? "";
    } catch {
      customUrl = "";
    }
  }
  return { mode: stored.mode, customUrl };
}

/** A typed-in custom URL the platform would refuse (empty is not yet invalid). */
export function isScreenshotUrlInvalid(draft: ScreenshotServiceDraft): boolean {
  return draft.mode === "custom" && draft.customUrl.trim() !== "" && !isAllowedCustomServiceUrl(draft.customUrl);
}

export type ScreenshotServiceError =
  | { key: "screenshotServiceUrlInvalid" | "screenshotServiceVaultLocked" | "screenshotServiceSaveFailed" }
  /** The server's (or the network's) own message. */
  | { message: string };

/** Save the choice and mirror it into the cached account. Null on success. */
export async function saveScreenshotService(
  deps: { api: PlatformApi; account: AccountStore; vault: VaultStore },
  draft: ScreenshotServiceDraft,
): Promise<ScreenshotServiceError | null> {
  if (draft.mode === "custom" && !isAllowedCustomServiceUrl(draft.customUrl)) {
    return { key: "screenshotServiceUrlInvalid" };
  }
  const settings: GameScreenshotServiceSettings = { mode: draft.mode };
  if (draft.mode === "custom") {
    const session = deps.vault.getState().session;
    if (!session) return { key: "screenshotServiceVaultLocked" };
    settings.customUrlEnc = session.encryptField(draft.customUrl.trim());
  }
  try {
    const res = await patchAccount(deps.api, { gameScreenshotService: settings });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return data?.error ? { message: data.error } : { key: "screenshotServiceSaveFailed" };
    }
  } catch (e) {
    return e instanceof Error && e.message ? { message: e.message } : { key: "screenshotServiceSaveFailed" };
  }
  patchGameScreenshotService(deps.account, settings);
  return null;
}
