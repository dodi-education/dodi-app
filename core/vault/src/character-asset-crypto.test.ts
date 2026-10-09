import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { CharacterAssetSummary } from "@dodi/types/database";

import {
  base64ToBytes,
  bytesToBase64,
  decryptCharacterAsset,
  decryptCharacterAssetGlb,
  encryptCharacterAssetFields,
} from "./character-asset-crypto";
import { VaultSession } from "./session";

function row(overrides: Partial<CharacterAssetSummary>): CharacterAssetSummary {
  return {
    id: "a1",
    kind: "accessory",
    name_enc: "",
    meta_enc: null,
    byte_size: 0,
    created_at: "2026-10-09T00:00:00Z",
    updated_at: "2026-10-09T00:00:00Z",
    ...overrides,
  };
}

describe("character asset crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("seals name, meta and file, and opens them again", () => {
    const glb = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    const sealed = encryptCharacterAssetFields(session, {
      name: "Wizard hat",
      meta: { v: 1, description: "pointy", socket: "socket_head_top" },
      glb,
    });
    expect(sealed.name_enc?.startsWith("enc:v1:")).toBe(true);
    expect(sealed.meta_enc?.startsWith("enc:v1:")).toBe(true);
    expect(sealed.glb_enc?.startsWith("enc:v1:")).toBe(true);
    expect(sealed.meta_enc).not.toContain("socket");
    expect(sealed.byte_size).toBe(1000);

    const view = decryptCharacterAsset(
      session,
      row({ name_enc: sealed.name_enc, meta_enc: sealed.meta_enc ?? null, byte_size: 1000 }),
    );
    expect(view).toMatchObject({
      id: "a1",
      kind: "accessory",
      name: "Wizard hat",
      meta: { v: 1, description: "pointy", socket: "socket_head_top" },
      byteSize: 1000,
    });
    expect(decryptCharacterAssetGlb(session, { glb_enc: sealed.glb_enc ?? "" })).toEqual(glb);
  });

  it("only seals present fields; null meta clears", () => {
    expect(encryptCharacterAssetFields(session, {})).toEqual({});
    expect(encryptCharacterAssetFields(session, { meta: null })).toEqual({ meta_enc: null });
  });

  it("leaves out an asset another vault sealed, and reads broken meta as empty", () => {
    const other = new VaultSession(generateVaultMasterKey());
    const foreign = encryptCharacterAssetFields(other, { name: "x" });
    expect(decryptCharacterAsset(session, row({ name_enc: foreign.name_enc }))).toBeNull();
    const mine = encryptCharacterAssetFields(session, { name: "y" });
    const meta = session.encryptJson({ v: 1, socket: 7, extra: "drop" });
    expect(decryptCharacterAsset(session, row({ name_enc: mine.name_enc, meta_enc: meta }))?.meta).toEqual({ v: 1 });
  });

  it("speaks standard base64, and reads url-safe too", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x01]);
    expect(bytesToBase64(bytes)).toBe("+/+/AQ==");
    expect(base64ToBytes("+/+/AQ==")).toEqual(bytes);
    expect(base64ToBytes("-_-_AQ")).toEqual(bytes);
    expect(bytesToBase64(new TextEncoder().encode("glTF"))).toBe("Z2xURg==");
  });
});
