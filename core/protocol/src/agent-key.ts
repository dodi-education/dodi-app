/**
 * Agent access keys: the copy-paste way to connect an agent that can't wait
 * for a browser approval (a long-running bot, CI). The parent creates one in
 * Settings > Agents; the browser draws a random 32-byte seed, derives a device
 * identity from it (`deriveDeviceKeyPairsFromSeed`), pairs and approves that
 * device itself, and shows
 *
 *   dodi_ak_<deviceId>_<seed, base64url>
 *
 * once. The CLI rebuilds the same keypairs from the seed. The server only ever
 * sees the derived public keys, so it cannot use the key, and losing the key
 * means revoking the agent in Settings, nothing more.
 */
import {
  DEVICE_SEED_LENGTH,
  deriveDeviceKeyPairsFromSeed,
  fromBase64Url,
  sha256Digest,
  toBase64Url,
  type DeviceKeyPairs,
} from "@dodi/crypto";

const PREFIX = "dodi_ak_";
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface AgentAccessKey {
  deviceId: string;
  seed: Uint8Array;
}

export function formatAgentAccessKey({ deviceId, seed }: AgentAccessKey): string {
  if (!DEVICE_ID.test(deviceId) || deviceId.includes("_")) {
    throw new Error("Invalid device id for an access key");
  }
  return `${PREFIX}${deviceId}_${toBase64Url(seed)}`;
}

/** Parse a pasted access key; null when it isn't one. */
export function parseAgentAccessKey(raw: string): AgentAccessKey | null {
  const value = raw.trim();
  if (!value.startsWith(PREFIX)) return null;
  const rest = value.slice(PREFIX.length);
  const split = rest.indexOf("_");
  if (split < 0) return null;
  const deviceId = rest.slice(0, split);
  if (!DEVICE_ID.test(deviceId)) return null;
  let seed: Uint8Array;
  try {
    seed = fromBase64Url(rest.slice(split + 1));
  } catch {
    return null;
  }
  return seed.length === DEVICE_SEED_LENGTH ? { deviceId, seed } : null;
}

/** The device identity an access key stands for. */
export function agentKeyPairs(key: AgentAccessKey): DeviceKeyPairs {
  return deriveDeviceKeyPairsFromSeed(key.seed);
}

/**
 * A short, human-comparable fingerprint of a device's signing key, shown by
 * the CLI next to its pairing code and on the approval screen, so a parent can
 * tell the request in front of them is the one their agent made.
 */
export function deviceFingerprint(signPublicKeyBase64Url: string): string {
  const hex = Array.from(sha256Digest(fromBase64Url(signPublicKeyBase64Url)).slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
