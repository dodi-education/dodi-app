/**
 * A login's personal key (user_keys): how a family member other than the owner
 * opens the family's vault (see @dodi/vault member-keys). Opaque to the
 * server: public keys in the clear, the seed wrapped by the login's password
 * and devices.
 */
import type { Json } from "@dodi/types/database";
import type { StoredUserKeys, StoredVaultKeys } from "@dodi/vault";

import type { Db } from "@/lib/db";

/** The login's own personal key; `db` acts as the login (RLS: own row). */
export async function getUserKeys(db: Db, userId: string): Promise<StoredUserKeys | null> {
  const row = await db
    .selectFrom("user_keys")
    .select(["kem_public_key", "sign_public_key", "vault_keys"])
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!row) return null;
  return {
    kemPublicKey: row.kem_public_key,
    signPublicKey: row.sign_public_key,
    vaultKeys: row.vault_keys as unknown as StoredVaultKeys,
  };
}

/**
 * Replace the wraps of the login's seed (password change, a new device). The
 * public keys stay: they are what families wrapped their key to. False when
 * the login has no personal key.
 */
export async function setUserVaultKeys(
  db: Db,
  userId: string,
  vaultKeys: StoredVaultKeys,
): Promise<boolean> {
  const rows = await db
    .updateTable("user_keys")
    .set({ vault_keys: vaultKeys as unknown as Json })
    .where("user_id", "=", userId)
    .returning("user_id")
    .execute();
  return rows.length > 0;
}

/**
 * Create or replace the login's personal key (joining a family). Replacing it
 * (a re-key after a lost password) leaves the wraps other families made to
 * the old key unusable; those families invite the login again. Service
 * handle: there is no insert policy, joining is the only way in.
 */
export async function putUserKeys(
  serviceDb: Db,
  userId: string,
  keys: StoredUserKeys,
): Promise<void> {
  const values = {
    kem_public_key: keys.kemPublicKey,
    sign_public_key: keys.signPublicKey,
    vault_keys: keys.vaultKeys as unknown as Json,
  };
  await serviceDb
    .insertInto("user_keys")
    .values({ user_id: userId, ...values })
    .onConflict((oc) => oc.column("user_id").doUpdateSet(values))
    .execute();
}

/**
 * Drop one device's wrap of a login's seed. Structural only, like
 * removeDeviceWrap for the family blob: used when that device is revoked.
 */
export async function removeUserDeviceWrap(
  serviceDb: Db,
  userId: string,
  deviceId: string,
): Promise<void> {
  const keys = await getUserKeys(serviceDb, userId);
  if (!keys) return;
  const deviceWraps = keys.vaultKeys.deviceWraps.filter((wrap) => wrap.deviceId !== deviceId);
  if (deviceWraps.length === keys.vaultKeys.deviceWraps.length) return;
  await setUserVaultKeys(serviceDb, userId, { ...keys.vaultKeys, deviceWraps });
}
