import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { Profile } from "@dodi/types/database";

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
    avatar_pin: null,
    active_persona_id: null,
    memory: null,
    parent_notes: null,
    language: "en",
    date_preferences: null,
    friend_kem_public_key: null,
    friend_sign_public_key: null,
    friend_secret_keys: null,
    can_add_friends: false,
    can_be_added_as_friend: false,
    incoming_friend_requests_require_parent_approval: true,
    outgoing_friend_requests_require_parent_approval: false,
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

  it("seals avatar_config as an opaque string and round-trips to an object", () => {
    const look = { color: 3, avatar: "animal_rabbit" };
    const enc = encryptProfileFields(session, { avatar_config: look });
    // Ciphertext is an opaque enc:v1: string, never a readable object.
    expect(typeof enc.avatar_config).toBe("string");
    expect((enc.avatar_config as unknown as string).startsWith("enc:v1:")).toBe(
      true,
    );

    const row = baseProfile({ avatar_config: enc.avatar_config });
    expect(decryptProfile(session, row).avatar_config).toEqual(look);
  });

  it("seals avatar_pin and round-trips the sequence; null clears it", () => {
    const seq = JSON.stringify(["animal_ape", "animal_frog", "animal_ape"]);
    const enc = encryptProfileFields(session, { avatar_pin: seq });
    expect(enc.avatar_pin?.startsWith("enc:v1:")).toBe(true);

    const row = baseProfile({ avatar_pin: enc.avatar_pin ?? null });
    expect(decryptProfile(session, row).avatar_pin).toBe(seq);

    // A disabled puzzle (null) passes through untouched.
    expect(encryptProfileFields(session, { avatar_pin: null }).avatar_pin).toBeNull();
    expect(decryptProfile(session, baseProfile({ avatar_pin: null })).avatar_pin).toBeNull();
  });
});
