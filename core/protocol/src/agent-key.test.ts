import { deriveDeviceKeyPairsFromSeed, randomBytes, toBase64Url } from "@dodi/crypto";
import { describe, expect, it } from "vitest";

import { agentKeyPairs, deviceFingerprint, formatAgentAccessKey, parseAgentAccessKey } from "./agent-key";

describe("agent access keys", () => {
  it("round-trips and rebuilds the same device identity", () => {
    const seed = randomBytes(32);
    const key = formatAgentAccessKey({ deviceId: "AbCdEfGh12345678", seed });
    expect(key.startsWith("dodi_ak_AbCdEfGh12345678_")).toBe(true);
    const parsed = parseAgentAccessKey(`  ${key}\n`);
    expect(parsed?.deviceId).toBe("AbCdEfGh12345678");
    expect(agentKeyPairs(parsed!).kem.publicKey).toEqual(deriveDeviceKeyPairsFromSeed(seed).kem.publicKey);
  });

  it("rejects things that aren't access keys", () => {
    expect(parseAgentAccessKey("dodidev_abc.def")).toBeNull();
    expect(parseAgentAccessKey("dodi_ak_short_x")).toBeNull();
    expect(parseAgentAccessKey(`dodi_ak_AbCdEfGh12345678_${toBase64Url(randomBytes(16))}`)).toBeNull();
  });

  it("refuses a device id the key format can't carry", () => {
    expect(() => formatAgentAccessKey({ deviceId: "has_underscore", seed: randomBytes(32) })).toThrow();
  });

  it("gives a stable short fingerprint", () => {
    const pub = toBase64Url(deriveDeviceKeyPairsFromSeed(new Uint8Array(32)).sign.publicKey);
    expect(deviceFingerprint(pub)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(deviceFingerprint(pub)).toBe(deviceFingerprint(pub));
  });
});

describe("device key binding", () => {
  it("verifies a device's own KEM key and rejects a swapped one", async () => {
    const { generateDeviceKeyPairs } = await import("@dodi/crypto");
    const { signDeviceKeys, verifyDeviceKeys } = await import("./agent-key");
    const device = generateDeviceKeyPairs();
    const attacker = generateDeviceKeyPairs();
    const kemPublicKey = toBase64Url(device.kem.publicKey);
    const signPublicKey = toBase64Url(device.sign.publicKey);
    const signature = signDeviceKeys(device.sign.secretKey, "dev-12345678", kemPublicKey);

    expect(verifyDeviceKeys({ deviceId: "dev-12345678", kemPublicKey, signPublicKey, signature })).toBe(true);
    // A server swapping in its own KEM key (or another device id) fails.
    expect(
      verifyDeviceKeys({
        deviceId: "dev-12345678",
        kemPublicKey: toBase64Url(attacker.kem.publicKey),
        signPublicKey,
        signature,
      }),
    ).toBe(false);
    expect(verifyDeviceKeys({ deviceId: "dev-other", kemPublicKey, signPublicKey, signature })).toBe(false);
    expect(verifyDeviceKeys({ deviceId: "dev-12345678", kemPublicKey, signPublicKey, signature: "x" })).toBe(false);
  });
});
