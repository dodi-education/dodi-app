import { describe, expect, it } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { Game, GameVersion, Json } from "@dodi/types/database";

import {
  type GameContentFields,
  decryptGame,
  decryptGameVersion,
  encryptGameCreateFields,
  encryptGameFields,
  isEncryptableGame,
  toPublicationContent,
} from "./game-crypto";
import { VaultSession } from "./session";

const CRITERIA: Json = {
  description: "3 sums, no hints",
  match: "all",
  conditions: [{ metric: "correct", op: "gte", value: 3 }],
  requiredMetrics: ["correct"],
};

function baseGame(overrides: Partial<Game>): Game {
  return {
    id: "g1",
    account_id: "a1",
    kid_id: "k1",
    source_game_id: null,
    system_key: null,
    is_system: false,
    title: "Counting Comets",
    description: "Count the comets",
    target_age_min: 5,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    tags: ["math"],
    code_bundle: "<html>game</html>",
    markdown: "# Briefing",
    learning_goal: "Count to ten",
    success_definition: "3 sums, no hints",
    success_criteria: CRITERIA,
    progress_kind: "goal",
    metadata: {},
    is_active: true,
    created_by: "parent",
    agent_transcript_enc: null,
    preview_image: null,
    current_game_version_id: null,
    publication_requested_at: null,
    published_at: null,
    approved_by: null,
    published_by_account_id: null,
    rejected_at: null,
    rejection_kind: null,
    rejection_reasons: null,
    review_attempts: 0,
    available_locales: null,
    created_at: "now",
    updated_at: "now",
    ...overrides,
  };
}

describe("game field crypto", () => {
  const session = new VaultSession(generateVaultMasterKey());

  it("seals every content field and leaves operational columns plaintext", () => {
    const enc = encryptGameFields(session, {
      title: "Counting Comets",
      description: "Count the comets",
      code_bundle: "<html>game</html>",
      markdown: "# Briefing",
      learning_goal: "Count to ten",
      success_definition: "3 sums, no hints",
      preview_image: "data:image/png;base64,AAAA",
    });
    for (const value of Object.values(enc)) {
      expect(typeof value === "string" && value.startsWith("enc:v1:")).toBe(true);
    }

    // The row's filter/routing columns are never touched by the sealer.
    const row = baseGame({ title: enc.title!, tags: ["math", "space"] });
    const decrypted = decryptGame(session, row);
    expect(decrypted.tags).toEqual(["math", "space"]);
    expect(decrypted.progress_kind).toBe("goal");
    expect(decrypted.target_age_min).toBe(5);
  });

  it("round-trips a stored row", () => {
    const enc = encryptGameFields(session, {
      title: "Counting Comets 🚀",
      description: "Count the comets",
      code_bundle: "<html>game</html>",
      markdown: "# Briefing",
      learning_goal: "Count to ten",
      success_definition: "3 sums, no hints",
      success_criteria: CRITERIA,
      preview_image: "data:image/png;base64,AAAA",
    });
    const decrypted = decryptGame(
      session,
      baseGame({
        title: enc.title!,
        description: enc.description!,
        code_bundle: enc.code_bundle!,
        markdown: enc.markdown!,
        learning_goal: enc.learning_goal!,
        success_definition: enc.success_definition!,
        success_criteria: enc.success_criteria!,
        preview_image: enc.preview_image ?? null,
      }),
    );
    expect(decrypted.title).toBe("Counting Comets 🚀");
    expect(decrypted.description).toBe("Count the comets");
    expect(decrypted.code_bundle).toBe("<html>game</html>");
    expect(decrypted.markdown).toBe("# Briefing");
    expect(decrypted.learning_goal).toBe("Count to ten");
    expect(decrypted.success_definition).toBe("3 sums, no hints");
    expect(decrypted.success_criteria).toEqual(CRITERIA);
    expect(decrypted.preview_image).toBe("data:image/png;base64,AAAA");
  });

  it("seals success_criteria as an opaque string, not a readable object", () => {
    const enc = encryptGameFields(session, { success_criteria: CRITERIA });
    expect(typeof enc.success_criteria).toBe("string");
    // The generic preserves the caller's input type, so the sealed value needs a
    // widening cast to be read as the string it now is (same as avatar_config).
    expect((enc.success_criteria as unknown as string).startsWith("enc:v1:")).toBe(
      true,
    );
    expect(JSON.stringify(enc.success_criteria)).not.toContain("no hints");
  });

  it("passes legacy plaintext rows through untouched", () => {
    const decrypted = decryptGame(session, baseGame({}));
    expect(decrypted.title).toBe("Counting Comets");
    expect(decrypted.code_bundle).toBe("<html>game</html>");
    expect(decrypted.success_criteria).toEqual(CRITERIA);
    expect(decrypted.preview_image).toBeNull();
  });

  it("reads a system game with a locked vault", () => {
    const locked = new VaultSession(generateVaultMasterKey());
    locked.lock();
    const system = baseGame({
      is_system: true,
      account_id: null,
      kid_id: null,
      system_key: "drawing",
      preview_image: "/images/game-previews/drawing.svg",
    });
    const decrypted = decryptGame(locked, system);
    expect(decrypted.title).toBe("Counting Comets");
    expect(decrypted.preview_image).toBe("/images/game-previews/drawing.svg");
  });

  it("skips absent fields on partial updates", () => {
    const fields: GameContentFields = { code_bundle: "<html>only code</html>" };
    const enc = encryptGameFields(session, fields);
    expect(enc.title).toBeUndefined();
    expect(enc.markdown).toBeUndefined();
    expect(enc.code_bundle?.startsWith("enc:v1:")).toBe(true);
  });

  it("seals the camelCase create payload", () => {
    const enc = encryptGameCreateFields(session, {
      title: "Counting Comets",
      codeBundle: "<html>game</html>",
      learningGoal: "Count to ten",
      successCriteria: CRITERIA,
    });
    expect(enc.title?.startsWith("enc:v1:")).toBe(true);
    expect(enc.codeBundle?.startsWith("enc:v1:")).toBe(true);
    expect(enc.learningGoal?.startsWith("enc:v1:")).toBe(true);
    expect((enc.successCriteria as unknown as string).startsWith("enc:v1:")).toBe(
      true,
    );
    expect(session.decryptField(enc.codeBundle!)).toBe("<html>game</html>");
  });

  it("round-trips a version row's code", () => {
    const stored: GameVersion = {
      id: "v1",
      game_id: "g1",
      account_id: "a1",
      code_bundle: session.encryptField("<html>v1</html>"),
      previous_game_version_id: null,
      created_at: "now",
    };
    expect(decryptGameVersion(session, stored).code_bundle).toBe("<html>v1</html>");
  });

  describe("isEncryptableGame", () => {
    it("seals a private parent/kid game", () => {
      expect(isEncryptableGame(baseGame({}))).toBe(true);
    });

    it("leaves system games plaintext", () => {
      expect(isEncryptableGame(baseGame({ is_system: true }))).toBe(false);
    });

    it("leaves a submitted publication copy plaintext, approved or not", () => {
      expect(
        isEncryptableGame(baseGame({ publication_requested_at: "now" })),
      ).toBe(false);
      expect(
        isEncryptableGame(
          baseGame({
            publication_requested_at: "now",
            published_at: "now",
            approved_by: "system",
          }),
        ),
      ).toBe(false);
    });
  });

  it("projects a decrypted row onto the publication payload", () => {
    const content = toPublicationContent(baseGame({}));
    expect(content).toEqual({
      title: "Counting Comets",
      description: "Count the comets",
      codeBundle: "<html>game</html>",
      markdown: "# Briefing",
      learningGoal: "Count to ten",
      successDefinition: "3 sums, no hints",
      successCriteria: CRITERIA,
      previewImage: null,
    });
  });
});
