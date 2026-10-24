/**
 * Platform calls for family members other than the owner (see @dodi/vault
 * member-keys): their unlock keys, their personal key, and adding a device to
 * the family's vault without rewriting the owner's blob. Over `api.request`,
 * so the PlatformApi port stays as it is.
 */
import type { KemWrappedKey } from "@dodi/crypto";
import type { UnlockKeys } from "@dodi/protocol/family-members";
import type { StoredUserKeys, StoredVaultKeys } from "@dodi/vault";

import type { PlatformApi } from "./platform";

export type MemberUnlockKeys = Extract<UnlockKeys, { kind: "member" }>;

async function failed(res: Response, action: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(`Failed to ${action} (${res.status})${body?.error ? `: ${body.error}` : ""}`);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/vault/unlock-keys, for a member. */
export async function fetchMemberUnlockKeys(api: PlatformApi): Promise<MemberUnlockKeys> {
  const res = await api.request("/api/vault/unlock-keys");
  if (!res.ok) throw await failed(res, "load your keys");
  const body = (await res.json()) as UnlockKeys;
  if (body.kind !== "member") throw new Error("Expected a member's keys");
  return body;
}

/** GET /api/user-keys: the login's personal key (null when it has none). */
export async function fetchUserKeys(api: PlatformApi): Promise<StoredUserKeys | null> {
  const res = await api.request("/api/user-keys");
  if (!res.ok) throw await failed(res, "load your keys");
  const body = (await res.json()) as { userKeys: StoredUserKeys | null };
  return body.userKeys;
}

/** PUT /api/user-keys: new wraps of the personal key. */
export async function putUserVaultKeys(api: PlatformApi, vaultKeys: StoredVaultKeys): Promise<void> {
  const res = await api.request("/api/user-keys", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ vaultKeys }),
  });
  if (!res.ok) throw await failed(res, "save your keys");
}

/** POST /api/vault/device-wraps: one more device on the family's vault. */
export async function appendFamilyDeviceWrap(
  api: PlatformApi,
  wrap: { deviceId: string; deviceKemPublicKey: string; wrapped: KemWrappedKey },
): Promise<void> {
  const res = await api.request("/api/vault/device-wraps", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(wrap),
  });
  if (!res.ok) throw await failed(res, "add the device");
}

/** DELETE /api/vault/device-wraps: drop a device's wrap again. */
export async function removeFamilyDeviceWrap(api: PlatformApi, deviceId: string): Promise<void> {
  const res = await api.request(
    `/api/vault/device-wraps?deviceId=${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await failed(res, "remove the device");
}
