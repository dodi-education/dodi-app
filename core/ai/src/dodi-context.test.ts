import { describe, expect, it } from "vitest";

import {
  buildGameTextContext,
  buildGameVoiceContext,
  buildHomeVoiceContext,
} from "./dodi-context";

const base = {
  personaSoul: "SOUL",
  personaName: "Dodi",
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

const homeBase = {
  personaSoul: "SOUL",
  personaName: "Dodi",
  childName: "Ada",
  childBirthdate: null,
  childLanguage: "en",
  memory: null,
  parentNotes: null,
  gameCatalog: [
    { id: "g1", title: "Dragon Draw", description: "draw dragons", tags: ["art"] },
  ],
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

  it("generate_text capability registers the voice tool, never set_generated_text", () => {
    const withCap = buildGameVoiceContext({
      ...base,
      capabilities: ["generate_text"],
    }).tools.map((t) => t.name);
    expect(withCap).toContain("generate_text");
    expect(withCap).not.toContain("set_generated_text");

    const withoutCap = buildGameVoiceContext({ ...base, capabilities: [] }).tools.map(
      (t) => t.name,
    );
    expect(withoutCap).not.toContain("generate_text");
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

describe("launch_game in game mode", () => {
  const CURRENT = "af7e848c-faa8-490c-bd38-3fdbafe1216c";
  const OTHER = "1b2c3d4e-0000-4000-8000-000000000001";
  const catalog = [
    { id: CURRENT, title: "Buchstabenlabyrinth", description: "", tags: ["reading"] },
    { id: OTHER, title: "Zählen mit Tieren", description: "", tags: ["math"] },
  ];

  it("gates launch_game on a clear request to open a DIFFERENT game and says it leaves the game", () => {
    const sys = buildGameVoiceContext({
      ...base,
      gameTitle: "Buchstabenlabyrinth",
      gameId: CURRENT,
      gameCatalog: catalog,
      capabilities: [],
    }).systemInstruction;
    expect(sys).toContain("## Leaving the Game (launch_game)");
    expect(sys).toContain("LEAVES this game");
    expect(sys).toContain("clearly asks YOU to open a DIFFERENT game");
    expect(sys).toContain("NOT a request to open it");
    expect(sys).toContain(`already open (id ${CURRENT})`);
  });

  it("lists the catalog with ids, marks the open game, and forbids title ids", () => {
    const sys = buildGameVoiceContext({
      ...base,
      gameId: CURRENT,
      gameCatalog: catalog,
      capabilities: [],
    }).systemInstruction;
    expect(sys).toContain(`| ${CURRENT} | Buchstabenlabyrinth (currently open) | reading |`);
    expect(sys).toContain(`| ${OTHER} | Zählen mit Tieren | math |`);
    expect(sys).toContain("the UUID, never the title");
  });

  it("maps 'again/restart' to restart_game when the game declares it", () => {
    const sys = buildGameVoiceContext({
      ...base,
      capabilities: ["restart_game"],
    }).systemInstruction;
    expect(sys).toContain("call `restart_game`, never `launch_game`");
  });

  it("without restart_game, forbids answering 'again' with launch_game", () => {
    const sys = buildGameVoiceContext({ ...base, capabilities: [] }).systemInstruction;
    expect(sys).toContain("NEVER answer that with `launch_game`");
  });

  it("without a catalog, forbids passing game_id at all", () => {
    const sys = buildGameVoiceContext({ ...base, capabilities: [] }).systemInstruction;
    expect(sys).toContain("NEVER pass `game_id`");
    expect(sys).not.toContain("| id | title | tags |");
  });

  it("keeps launch_game registered in game mode", () => {
    const names = buildGameVoiceContext({ ...base, capabilities: [] }).tools.map((t) => t.name);
    expect(names).toContain("launch_game");
  });
});

describe("addressing / intent awareness (voice only)", () => {
  it("both voice modes carry the Hearing vs. Being Asked section with the persona name", () => {
    const game = buildGameVoiceContext({ ...base, capabilities: [] }).systemInstruction;
    const home = buildHomeVoiceContext(homeBase).systemInstruction;

    for (const sys of [game, home]) {
      expect(sys).toContain("## Hearing vs. Being Asked");
      // The name is the strong "addressed" signal, with transcription variants.
      expect(sys).toContain('"Dodi"');
      expect(sys).toContain("Dodie");
      // Narration/self-talk must NOT be treated as a command.
      expect(sys).toContain("NOT meant for you");
    }
  });

  it("uses a custom persona name in the addressing section", () => {
    const sys = buildGameVoiceContext({
      ...base,
      personaName: "Fluffi",
      capabilities: [],
    }).systemInstruction;
    expect(sys).toContain('"Fluffi"');
  });

  it("adds a German-phonetics hint only for German", () => {
    const de = buildGameVoiceContext({
      ...base,
      childLanguage: "de",
      capabilities: [],
    }).systemInstruction;
    const en = buildGameVoiceContext({
      ...base,
      childLanguage: "en",
      capabilities: [],
    }).systemInstruction;
    expect(de).toContain("German");
    expect(en).not.toContain("shifted vowels");
  });

  it("keeps the same-turn reliability rule, scoped to directed requests", () => {
    const sys = buildGameVoiceContext({ ...base, capabilities: [] }).systemInstruction;
    // The 38%→100% first-ask reliability rule must survive.
    expect(sys).toContain("SAME turn");
    expect(sys).toContain("Announcing an action is NOT the same as doing it");
    // ...but mutating tools are now gated on a directed request.
    expect(sys).toContain("directed at you");
    expect(sys).toContain("overheard narration");
    // Read-only tools stay permissive.
    expect(sys).toContain("only LOOK");
  });

  it("text mode never gets the addressing section", () => {
    const sys = buildGameTextContext({ ...base, capabilities: [] }).systemInstruction;
    expect(sys).not.toContain("## Hearing vs. Being Asked");
  });

  it("home mode gates launch_game on a clear request", () => {
    const sys = buildHomeVoiceContext(homeBase).systemInstruction;
    expect(sys).toContain("clearly asks YOU to open or play");
    expect(sys).toContain("not a request");
  });
});
