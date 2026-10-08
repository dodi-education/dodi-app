/**
 * Account deletion's local half: what a plain sign-out keeps for the next
 * sign-in on this device, and which belongs to the deleted account.
 */
import { Storage } from "expo-sqlite/kv-store";

import { clearAllCheckpoints } from "./checkpoint-store";
import { sealedSlot } from "./sealed-storage";

/** Sealed slots of `sealed-storage` (their keys live in SecureStore, outside the kv store). */
const SEALED_SLOTS = ["device", "registration", "offline-vault-keys"];

/**
 * Remove the device keystore and the other sealed slots, the kv store
 * (transcript and play outboxes, per-kid flags, the last view) and Game Studio
 * build checkpoints. Run after the account is deleted and signed out. Best
 * effort: nothing here is usable without the deleted account anyway.
 */
export async function wipeDeviceData(): Promise<void> {
  await Promise.all(SEALED_SLOTS.map((name) => sealedSlot(name).clear().catch(() => {})));
  try {
    Storage.clearSync();
  } catch {
    // An unreadable store holds nothing to protect.
  }
  try {
    clearAllCheckpoints();
  } catch {
    // Same: best effort.
  }
}
