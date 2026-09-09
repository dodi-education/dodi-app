import { generateSocialId } from "@dodi/crypto/social-id";
import type { Device, DeviceStatus, DeviceUpdate } from "@dodi/types/database";

import type { Db } from "@/lib/db";

export interface EnrollInput {
  deviceId: string;
  kemPublicKey: string;
  signPublicKey: string;
  name?: string | null;
}

/** Create a pending (unclaimed) device with a short pairing code. Service-role. */
export async function createPendingDevice(
  db: Db,
  input: EnrollInput,
): Promise<{ id: string; pairingCode: string }> {
  const pairingCode = generateSocialId(8);
  const { id } = await db
    .insertInto("devices")
    .values({
      device_id: input.deviceId,
      kem_public_key: input.kemPublicKey,
      sign_public_key: input.signPublicKey,
      name: input.name ?? null,
      status: "pending",
      pairing_code: pairingCode,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id, pairingCode };
}

/** Claim a pending device by pairing code, binding it to the account. Service-role. */
export async function claimDevice(
  db: Db,
  pairingCode: string,
  accountId: string,
): Promise<Device> {
  const found = await db
    .selectFrom("devices")
    .selectAll()
    .where("pairing_code", "=", pairingCode)
    .where("status", "=", "pending")
    .where("account_id", "is", null)
    .executeTakeFirst();
  if (!found) throw new Error("No pending device for that pairing code");

  return db
    .updateTable("devices")
    .set({ account_id: accountId, pairing_code: null })
    .where("id", "=", found.id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listDevices(db: Db, accountId: string): Promise<Device[]> {
  return db
    .selectFrom("devices")
    .selectAll()
    .where("account_id", "=", accountId)
    .orderBy("created_at", "desc")
    .execute();
}

async function setStatus(
  db: Db,
  accountId: string,
  id: string,
  status: DeviceStatus,
  extra: DeviceUpdate = {},
): Promise<Device> {
  return db
    .updateTable("devices")
    .set({ status, ...extra })
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function activateDevice(db: Db, accountId: string, id: string) {
  return setStatus(db, accountId, id, "active", {
    enrolled_at: new Date().toISOString(),
  });
}

export function revokeDevice(db: Db, accountId: string, id: string) {
  return setStatus(db, accountId, id, "revoked");
}

export async function deleteDevice(
  db: Db,
  accountId: string,
  id: string,
): Promise<void> {
  await db
    .deleteFrom("devices")
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .execute();
}

/** Load an active device by its device_id (for challenge/token). Service-role. */
export async function getActiveDevice(
  db: Db,
  deviceId: string,
): Promise<Device | null> {
  const row = await db
    .selectFrom("devices")
    .selectAll()
    .where("device_id", "=", deviceId)
    .where("status", "=", "active")
    .executeTakeFirst();
  return row ?? null;
}

/** Best-effort last-seen stamp: a failure never blocks token issuance. */
export async function touchLastSeen(db: Db, id: string): Promise<void> {
  try {
    await db
      .updateTable("devices")
      .set({ last_seen_at: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  } catch {
    // Ignored on purpose (the former client swallowed this error too).
  }
}
