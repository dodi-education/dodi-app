import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { Persona } from "@dodi/types/database";

import {
  type PersonaPersonalFields,
  decryptPersona,
  encryptPersonaFields,
  isEncryptablePersona,
} from "./persona-crypto";
import { VaultSession } from "./session";

function basePersona(overrides: Partial<Persona>): Persona {
  return {
    id: "persona1",
    account_id: "a1",
    name: "Math Tutor",
    soul: "# Math Tutor\n\n- Patient and encouraging",
    is_system_default: false,
    created_at: "now",
    updated_at: "now",
    ...overrides,
  };
}

describe("persona field crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("flags only account-owned personas as encryptable", () => {
    expect(isEncryptablePersona({ account_id: "a1", is_system_default: false })).toBe(true);
    // The shared default (no account, system flag) stays plaintext.
    expect(isEncryptablePersona({ account_id: null, is_system_default: true })).toBe(false);
    expect(isEncryptablePersona({ account_id: null, is_system_default: false })).toBe(false);
  });

  it("encrypts both name and soul to opaque enc:v1: strings", () => {
    const enc = encryptPersonaFields(session, {
      name: "Tutor for Lily",
      soul: "# Soul\n\n- secret context",
    });
    expect(enc.name?.startsWith("enc:v1:")).toBe(true);
    expect(enc.soul?.startsWith("enc:v1:")).toBe(true);
  });

  it("round-trips an account persona through a stored row", () => {
    const enc = encryptPersonaFields(session, {
      name: "Tutor for Lily 🦕",
      soul: "# Soul\n\n- Loves dinosaurs",
    });
    const row = basePersona({ name: enc.name!, soul: enc.soul! });
    const decrypted = decryptPersona(session, row);
    expect(decrypted.name).toBe("Tutor for Lily 🦕");
    expect(decrypted.soul).toBe("# Soul\n\n- Loves dinosaurs");
  });

  it("leaves the system default untouched (no decryption attempted)", () => {
    const system = basePersona({
      account_id: null,
      is_system_default: true,
      name: "Dodi",
      soul: "# Dodi\n\n- Friendly",
    });
    const decrypted = decryptPersona(session, system);
    expect(decrypted.name).toBe("Dodi");
    expect(decrypted.soul).toBe("# Dodi\n\n- Friendly");
  });

  it("passes through legacy plaintext on an account persona", () => {
    // An account persona written before encryption rolled out.
    const row = basePersona({ name: "Old Tutor", soul: "# Old soul" });
    const decrypted = decryptPersona(session, row);
    expect(decrypted.name).toBe("Old Tutor");
    expect(decrypted.soul).toBe("# Old soul");
  });

  it("skips absent fields on partial updates", () => {
    const fields: PersonaPersonalFields = { name: "Renamed" };
    const enc = encryptPersonaFields(session, fields);
    expect(enc.name?.startsWith("enc:v1:")).toBe(true);
    expect(enc.soul).toBeUndefined();
  });
});
