import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { Profile } from "@/types/database";

import {
  type ProfilePersonalFields,
  decryptProfile,
  encryptProfileFields,
} from "./profile-crypto";
import { VaultSession } from "./session";

function baseProfile(overrides: Partial<Profile>): Profile {
  return {
    id: "p1",
    account_id: "a1",
    display_name: "Emma",
    social_id: "k7m2q9x4tp",
    birthdate: "2018-04-05",
    avatar_config: null,
    active_persona_id: null,
    memory: null,
    parent_notes: null,
    language: "en",
    first_interaction: false,
    preferences: null,
    created_at: "now",
    updated_at: "now",
    ...overrides,
  };
}

describe("profile field crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("encrypts only the personal fields, leaving metadata plaintext", () => {
    const enc = encryptProfileFields(session, {
      display_name: "Emma",
      birthdate: "2018-04-05",
      parent_notes: "Shy about reading.",
    });
    expect(enc.display_name?.startsWith("enc:v1:")).toBe(true);
    expect(enc.birthdate?.startsWith("enc:v1:")).toBe(true);
    expect(enc.parent_notes?.startsWith("enc:v1:")).toBe(true);
  });

  it("round-trips through a stored row", () => {
    const enc = encryptProfileFields(session, {
      display_name: "Emma",
      birthdate: "2018-04-05",
      parent_notes: "Loves dinosaurs 🦕",
    });
    const row = baseProfile({
      display_name: enc.display_name!,
      birthdate: enc.birthdate ?? null,
      parent_notes: enc.parent_notes ?? null,
    });
    const decrypted = decryptProfile(session, row);
    expect(decrypted.display_name).toBe("Emma");
    expect(decrypted.birthdate).toBe("2018-04-05");
    expect(decrypted.parent_notes).toBe("Loves dinosaurs 🦕");
    // metadata untouched
    expect(decrypted.social_id).toBe("k7m2q9x4tp");
    expect(decrypted.language).toBe("en");
  });

  it("leaves null fields null and passes through legacy plaintext", () => {
    const row = baseProfile({
      display_name: "PlaintextName", // legacy / not yet encrypted
      birthdate: null,
      parent_notes: null,
    });
    const decrypted = decryptProfile(session, row);
    expect(decrypted.display_name).toBe("PlaintextName");
    expect(decrypted.birthdate).toBeNull();
    expect(decrypted.parent_notes).toBeNull();
  });

  it("skips absent fields on partial updates", () => {
    const fields: ProfilePersonalFields = { parent_notes: "just notes" };
    const enc = encryptProfileFields(session, fields);
    expect(enc.display_name).toBeUndefined();
    expect(enc.parent_notes?.startsWith("enc:v1:")).toBe(true);
  });
});
