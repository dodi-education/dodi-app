import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { KidCompanion } from "@dodi/types/database";

import { decryptCompanion, encryptCompanionFields } from "./companion-crypto";
import { VaultSession } from "./session";

function companion(overrides: Partial<KidCompanion>): KidCompanion {
  return {
    id: "c1",
    persona_id: null,
    name_enc: null,
    look_enc: null,
    created_at: "now",
    persona: null,
    ...overrides,
  };
}

describe("companion crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("seals name and look and opens them again", () => {
    const look = { v: 1, model: "dodi", colors: { suit: "#ff8800" }, accessories: ["party_hat"] };
    const sealed = encryptCompanionFields(session, { name: "Captain Feathers", look });
    expect(sealed.name_enc?.startsWith("enc:v1:")).toBe(true);
    expect(sealed.look_enc?.startsWith("enc:v1:")).toBe(true);
    expect(sealed.look_enc).not.toContain("dodi");

    const opened = decryptCompanion(session, companion({ ...sealed }));
    expect(opened.name).toBe("Captain Feathers");
    expect(opened.look).toEqual(look);
  });

  it("only writes present fields and maps null to a reset", () => {
    expect(encryptCompanionFields(session, {})).toEqual({});
    expect(encryptCompanionFields(session, { name: null })).toEqual({ name_enc: null });
  });

  it("reads NULL columns as the catalog defaults", () => {
    const opened = decryptCompanion(session, companion({}));
    expect(opened.name).toBeNull();
    expect(opened.look).toBeNull();
  });

  it("treats an unreadable look as the defaults instead of throwing", () => {
    const other = new VaultSession(generateVaultMasterKey());
    const foreign = encryptCompanionFields(other, { look: { v: 1 } }).look_enc!;
    expect(decryptCompanion(session, companion({ look_enc: foreign })).look).toBeNull();
  });

  it("opens an account persona's name, keeps the system default plaintext", () => {
    const name = session.encryptField("Explorer");
    const opened = decryptCompanion(
      session,
      companion({ persona: { id: "p", name, account_id: "a", is_system_default: false } }),
    );
    expect(opened.persona?.name).toBe("Explorer");
    const system = decryptCompanion(
      session,
      companion({ persona: { id: "s", name: "Dodi", account_id: null, is_system_default: true } }),
    );
    expect(system.persona?.name).toBe("Dodi");
  });
});
