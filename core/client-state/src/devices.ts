/**
 * Paired devices that can silently unlock the E2EE vault. Pairing wraps the
 * in-memory vault key to the new device's KEM key (client-side) and persists
 * the wrap BEFORE activating the device, so an active device always has a
 * usable wrap; revoking drops the wrap first, so the device loses access even
 * when the status update fails. The server never sees the vault key.
 */
import type { Device } from "@dodi/types/database";

import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface DevicesDeps {
  api: PlatformApi;
  vault: VaultStore;
}

interface ClaimedDevice {
  id: string;
  deviceId: string;
  kemPublicKey: string;
}

/** The account's devices; [] when the list can't load. */
export async function loadDevices(api: PlatformApi): Promise<Device[]> {
  try {
    const res = await api.request("/api/devices");
    const data = (res.ok ? await res.json() : { devices: [] }) as { devices?: unknown };
    return Array.isArray(data.devices) ? (data.devices as Device[]) : [];
  } catch {
    return [];
  }
}

/** Claim a pairing code, wrap the vault to the device, then activate it. */
export async function pairDevice(deps: DevicesDeps, pairingCode: string): Promise<boolean> {
  const code = pairingCode.trim();
  if (!code) return false;
  try {
    const res = await deps.api.request("/api/devices/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: code }),
    });
    if (!res.ok) return false;
    const claimed = (await res.json()) as ClaimedDevice;
    await deps.vault.getState().addDevice({
      deviceId: claimed.deviceId,
      deviceKemPublicKey: claimed.kemPublicKey,
    });
    const activated = await deps.api.request(`/api/devices/${claimed.id}/activate`, {
      method: "POST",
    });
    return activated.ok;
  } catch {
    return false;
  }
}

/** Drop the device's vault wrap, then mark it revoked. */
export async function revokeDevice(
  deps: DevicesDeps,
  device: Pick<Device, "id" | "device_id">,
): Promise<boolean> {
  try {
    await deps.vault.getState().removeDevice(device.device_id);
    const res = await deps.api.request(`/api/devices/${device.id}/revoke`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export type DeviceStatusKey = "deviceStatusActive" | "deviceStatusRevoked" | "deviceStatusPending";

/** The `settings` message key for a device status. */
export function deviceStatusKey(status: string): DeviceStatusKey {
  if (status === "active") return "deviceStatusActive";
  if (status === "revoked") return "deviceStatusRevoked";
  return "deviceStatusPending";
}
