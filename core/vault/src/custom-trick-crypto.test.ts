import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";

import { openCustomTrick, sealCustomTrick, type CustomTrickRecord } from "./custom-trick-crypto";
import { VaultSession } from "./session";

const RECORD: CustomTrickRecord = {
  v: 1,
  name: "Happy dance",
  description: "a happy dance",
  model: "dodi",
  requiredBones: ["root", "wing_L"],
  script: { v: 1, name: "Happy dance", duration: 1, poses: [{ t: 0.5, bones: {} }] },
};

describe("custom trick crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("seals the whole record and opens it again", () => {
    const sealed = sealCustomTrick(session, RECORD);
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("wing_L");
    expect(openCustomTrick(session, sealed)).toEqual(RECORD);
  });

  it("returns null for foreign keys or non-trick records", () => {
    const other = new VaultSession(generateVaultMasterKey());
    expect(openCustomTrick(session, sealCustomTrick(other, RECORD))).toBeNull();
    expect(openCustomTrick(session, session.encryptJson({ v: 2 }))).toBeNull();
  });
});
