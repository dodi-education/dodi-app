/**
 * Account-level settings saves shared by every client: the interface and
 * notification toggles (optimistic, reverted on failure) and the account's
 * `PATCH /api/account` call itself. (The UI language: `persistLanguage` in
 * ./onboarding.) Clients render the controls
 * and map the outcomes to copy.
 */
import type { Account, InterfacePreferences, Json } from "@dodi/types/database";

import {
  type AccountStore,
  type NotificationPreferences,
  interfacePreferencesOf,
  patchInterfacePreferences,
} from "./account-store";
import type { PlatformApi } from "./platform";

export interface AccountSettingsDeps {
  api: PlatformApi;
  account: AccountStore;
}

/** `PATCH /api/account` with a JSON body (the platform merges the fields). */
export function patchAccount(api: PlatformApi, body: Record<string, unknown>): Promise<Response> {
  return api.request("/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Save interface toggles: mirror them into the cached account first, then
 * PATCH; a failed save restores the previous toggles. True when saved.
 */
export async function saveInterfacePreferences(
  deps: AccountSettingsDeps,
  patch: InterfacePreferences,
): Promise<boolean> {
  const previous = interfacePreferencesOf(deps.account.getState().account);
  patchInterfacePreferences(deps.account, { ...previous, ...patch }); // optimistic
  try {
    const res = await patchAccount(deps.api, { interfacePreferences: patch });
    if (!res.ok) throw new Error("save_failed");
    return true;
  } catch {
    patchInterfacePreferences(deps.account, previous); // revert on failure
    return false;
  }
}

/** The account's stored notification toggles (null while unloaded / unset). */
export function notificationPreferencesOf(account: Account | null): NotificationPreferences | null {
  return (account?.notification_preferences ?? null) as NotificationPreferences | null;
}

/** Each email toggle as shown: opt-out, so absent reads as on. */
export function notificationTogglesOf(prefs: NotificationPreferences | null): {
  isFriendApprovalOn: boolean;
  isPublicationOutcomeOn: boolean;
} {
  return {
    isFriendApprovalOn: prefs?.friend_approval_email !== false,
    isPublicationOutcomeOn: prefs?.publication_outcome_email !== false,
  };
}

/**
 * Save notification toggles: optimistic like the interface toggles, reverted
 * when the PATCH fails. True when saved.
 */
export async function saveNotificationPreferences(
  deps: AccountSettingsDeps,
  patch: NotificationPreferences,
): Promise<boolean> {
  const setPrefs = (next: NotificationPreferences) =>
    deps.account.getState().patchLocal({ notification_preferences: next as Json });
  const previous = notificationPreferencesOf(deps.account.getState().account) ?? {};
  setPrefs({ ...previous, ...patch }); // optimistic
  try {
    const res = await patchAccount(deps.api, { notificationPreferences: patch });
    if (!res.ok) throw new Error("save_failed");
    return true;
  } catch {
    setPrefs(previous); // revert on failure
    return false;
  }
}
