import { describe, expect, it } from "vitest";

import { buildGameVoiceContext } from "./dodi-context";

const base = {
  personaSoul: "SOUL",
  childName: "Ada",
  childBirthdate: null,
  childLanguage: "en",
  memory: null,
  parentNotes: null,
  gameTitle: "T",
  gameDescription: "D",
  gameMarkdown: "",
  gameCodeBundle: "",
  gameState: {},
};

describe("buildGameVoiceContext tool registration", () => {
  it("empty capabilities → only meta tools, never execute_game_command", () => {
    const names = buildGameVoiceContext({ ...base, capabilities: [] }).tools.map((t) => t.name);
    expect(names).toContain("read_game_state");
    expect(names).toContain("launch_game");
    expect(names).not.toContain("execute_game_command");
    expect(
      names.filter((n) => !["read_game_state", "launch_game"].includes(n)),
    ).toHaveLength(0);
  });

  it("registers opted-in commands as first-class tools + meta", () => {
    const names = buildGameVoiceContext({
      ...base,
      capabilities: ["submit_answer", "next_task"],
    }).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["submit_answer", "next_task", "read_game_state", "launch_game"]),
    );
    expect(names).not.toContain("generate_drawing");
    expect(names).not.toContain("execute_game_command");
  });

  it("drops unknown capability names", () => {
    const names = buildGameVoiceContext({
      ...base,
      capabilities: ["submit_answer", "made_up"],
    }).tools.map((t) => t.name);
    expect(names).toContain("submit_answer");
    expect(names).not.toContain("made_up");
  });

  it("system instruction lists the registered tools, not the old generic tool", () => {
    const { systemInstruction } = buildGameVoiceContext({
      ...base,
      capabilities: ["generate_drawing"],
    });
    expect(systemInstruction).toContain("generate_drawing");
    expect(systemInstruction).not.toContain("execute_game_command");
  });
});
