import type { SupabaseClient } from "@supabase/supabase-js";

import { generateSocialId } from "@dodi/crypto/social-id";
import type { Database, Device, DeviceStatus } from "@dodi/types/database";

type Client = SupabaseClient<Database>;

export interface EnrollInput {
  deviceId: string;
  kemPublicKey: string;
  signPublicKey: string;
  name?: string | null;
}

/** Create a pending (unclaimed) device with a short pairing code. Service-role. */
export async function createPendingDevice(
  supabase: Client,
  input: EnrollInput,
): Promise<{ id: string; pairingCode: string }> {
  const pairingCode = generateSocialId(8);
  const { data, error } = await supabase
    .from("devices")
    .insert({
      device_id: input.deviceId,
      kem_public_key: input.kemPublicKey,
      sign_public_key: input.signPublicKey,
      name: input.name ?? null,
      status: "pending",
      pairing_code: pairingCode,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id, pairingCode };
}

/** Claim a pending device by pairing code, binding it to the account. Service-role. */
export async function claimDevice(
  supabase: Client,
  pairingCode: string,
  accountId: string,
): Promise<Device> {
  const { data: pending, error: findErr } = await supabase
    .from("devices")
    .select("*")
    .eq("pairing_code", pairingCode)
    .eq("status", "pending")
    .is("account_id", null)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  const found = pending as Device | null;
  if (!found) throw new Error("No pending device for that pairing code");

  const { data, error } = await supabase
    .from("devices")
    .update({ account_id: accountId, pairing_code: null })
    .eq("id", found.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Device;
}

export async function listDevices(
  supabase: Client,
  accountId: string,
): Promise<Device[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Device[];
}

async function setStatus(
  supabase: Client,
  accountId: string,
  id: string,
  status: DeviceStatus,
  extra: Record<string, unknown> = {},
): Promise<Device> {
  const { data, error } = await supabase
    .from("devices")
    .update({ status, ...extra })
    .eq("id", id)
    .eq("account_id", accountId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Device;
}

export function activateDevice(supabase: Client, accountId: string, id: string) {
  return setStatus(supabase, accountId, id, "active", {
    enrolled_at: new Date().toISOString(),
  });
}

export function revokeDevice(supabase: Client, accountId: string, id: string) {
  return setStatus(supabase, accountId, id, "revoked");
}

export async function deleteDevice(
  supabase: Client,
  accountId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("devices")
    .delete()
    .eq("id", id)
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);
}

/** Load an active device by its device_id (for challenge/token). Service-role. */
export async function getActiveDevice(
  supabase: Client,
  deviceId: string,
): Promise<Device | null> {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("device_id", deviceId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Device | null;
}

export async function touchLastSeen(supabase: Client, id: string): Promise<void> {
  await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id);
}
