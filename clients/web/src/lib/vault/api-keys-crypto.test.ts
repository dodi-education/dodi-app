import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@/lib/crypto";

import {
  type VaultProviders,
  decryptProviders,
  encryptProviders,
  providerKeyPreview,
} from "./api-keys-crypto";
import { VaultSession } from "./session";

describe("api keys crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  const providers: VaultProviders = {
    gemini: { key: "AIzaSy-secret-1234", keyPreview: "1234", addedAt: "2026-06-11T00:00:00Z" },
    anthropic: { key: "sk-ant-secret-abcd", keyPreview: "abcd", addedAt: "2026-06-11T00:01:00Z" },
  };

  it("round-trips the providers map", () => {
    const blob = encryptProviders(session, providers);
    expect(decryptProviders(session, blob)).toEqual(providers);
  });

  it("produces an opaque enc:v1 blob (server sees no key or preview)", () => {
    const blob = encryptProviders(session, providers);
    expect(blob.startsWith("enc:v1:")).toBe(true);
    expect(blob).not.toContain("AIzaSy");
    expect(blob).not.toContain("sk-ant");
    expect(blob).not.toContain("1234");
  });

  it("treats null/empty as an empty map", () => {
    expect(decryptProviders(session, null)).toEqual({});
    expect(decryptProviders(session, undefined)).toEqual({});
    expect(decryptProviders(session, "")).toEqual({});
  });

  it("a different vault can't read the blob", () => {
    const blob = encryptProviders(session, providers);
    const other = new VaultSession(generateVaultMasterKey());
    expect(() => decryptProviders(other, blob)).toThrow();
  });

  it("providerKeyPreview is the last 4 chars", () => {
    expect(providerKeyPreview("AIzaSy-secret-1234")).toBe("1234");
  });
});
