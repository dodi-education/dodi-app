import { describe, expect, it } from "vitest";

import { buildGameTextContext, buildGameVoiceContext } from "./dodi-context";

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
    expect(names).toContain("analyze_game_state");
    expect(names).toContain("launch_game");
    expect(names).not.toContain("execute_game_command");
    expect(
      names.filter(
        (n) => !["read_game_state", "analyze_game_state", "launch_game"].includes(n),
      ),
    ).toHaveLength(0);
  });

  it("registers opted-in commands as first-class tools + meta", () => {
    const names = buildGameVoiceContext({
      ...base,
      capabilities: ["submit_answer", "next_task"],
    }).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "submit_answer",
        "next_task",
        "read_game_state",
        "analyze_game_state",
        "launch_game",
      ]),
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

describe("snapshot tools & guidance", () => {
  it("save_state capability + friends → both snapshot tools, friend names listed", () => {
    const ctx = buildGameVoiceContext({
      ...base,
      capabilities: ["save_state"],
      friendNames: ["Lea", "Tom"],
    });
    const names = ctx.tools.map((t) => t.name);
    expect(names).toContain("save_snapshot");
    expect(names).toContain("share_snapshot");
    expect(ctx.systemInstruction).toContain("## Saving & Sharing Snapshots");
    expect(ctx.systemInstruction).toContain("Lea, Tom");
  });

  it("no friends → share_snapshot is dropped, save_snapshot stays", () => {
    const ctx = buildGameVoiceContext({
      ...base,
      capabilities: ["save_state"],
      friendNames: [],
    });
    const names = ctx.tools.map((t) => t.name);
    expect(names).toContain("save_snapshot");
    expect(names).not.toContain("share_snapshot");
    expect(ctx.systemInstruction).toContain("no connected friends");
  });

  it("no save_state capability → no snapshot tools or guidance", () => {
    const ctx = buildGameVoiceContext({
      ...base,
      capabilities: ["submit_answer"],
      friendNames: ["Lea"],
    });
    const names = ctx.tools.map((t) => t.name);
    expect(names).not.toContain("save_snapshot");
    expect(names).not.toContain("share_snapshot");
    expect(ctx.systemInstruction).not.toContain("## Saving & Sharing Snapshots");
  });

  it("text context documents the host commands when save_state is declared", () => {
    const { systemInstruction } = buildGameTextContext({
      ...base,
      capabilities: ["save_state"],
      friendNames: ["Lea"],
    });
    expect(systemInstruction).toContain("save_snapshot");
    expect(systemInstruction).toContain("share_snapshot");
    expect(systemInstruction).toContain("## Saving & Sharing Snapshots");

    const noFriends = buildGameTextContext({
      ...base,
      capabilities: ["save_state"],
      friendNames: [],
    }).systemInstruction;
    expect(noFriends).toContain("save_snapshot");
    expect(noFriends).not.toContain("`share_snapshot`");
  });
});
