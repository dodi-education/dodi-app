import {
  generateDeviceKeyPairs,
  sign as dsaSign,
  utf8ToBytes,
  verify as dsaVerify,
} from "@dodi/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  issueChallenge,
  issueDeviceBearer,
  verifyChallenge,
  verifyDeviceBearer,
} from "./device-token";

beforeAll(() => {
  process.env.DEVICE_TOKEN_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
});

describe("device-token", () => {
  it("issues + verifies a device bearer", () => {
    const token = issueDeviceBearer("acct-1", "dev-1");
    expect(verifyDeviceBearer(token)).toEqual({
      accountId: "acct-1",
      deviceId: "dev-1",
    });
  });

  it("treats a Supabase-JWT-shaped token as not-a-device-token", () => {
    expect(verifyDeviceBearer("header.payload.signature")).toBeNull();
  });

  it("rejects a tampered bearer", () => {
    const token = issueDeviceBearer("acct-1", "dev-1");
    expect(verifyDeviceBearer(token.slice(0, -2) + "zz")).toBeNull();
  });

  it("challenge round-trips only for the issued device", () => {
    const nonce = issueChallenge("dev-1");
    expect(verifyChallenge(nonce, "dev-1")).toBe(true);
    expect(verifyChallenge(nonce, "dev-2")).toBe(false);
  });

  it("ML-DSA challenge: device signs the nonce, platform verifies", () => {
    const device = generateDeviceKeyPairs();
    const nonce = issueChallenge("dev-1");
    const sig = dsaSign(device.sign.secretKey, utf8ToBytes(nonce));
    expect(dsaVerify(device.sign.publicKey, utf8ToBytes(nonce), sig)).toBe(true);

    const impostor = generateDeviceKeyPairs();
    expect(dsaVerify(impostor.sign.publicKey, utf8ToBytes(nonce), sig)).toBe(
      false,
    );
  });
});
