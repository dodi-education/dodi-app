import { describe, expect, it } from "vitest";

import {
  STANDARD_TOOLS,
  STANDARD_TOOLS_BY_NAME,
  META_TOOL_NAMES,
  REGISTRY_TOOL_NAMES,
  DECLARABLE_CAPABILITY_NAMES,
  toDeclaration,
  buildGameToolDeclarations,
  unknownCapabilities,
  standardCommandsDoc,
} from "./toolbox";

describe("standard toolbox registry", () => {
  it("has unique tool names", () => {
    const names = STANDARD_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every voice-exposed tool yields a valid Gemini declaration", () => {
    for (const t of STANDARD_TOOLS.filter((t) => t.voiceExposed)) {
      const d = toDeclaration(t);
      expect(d.name).toBe(t.name);
      expect(d.description.length).toBeGreaterThan(0);
      expect((d.parameters as { type?: string }).type).toBe("object");
    }
  });

  it("meta tools are registered + voice-exposed", () => {
    expect(META_TOOL_NAMES).toEqual(
      expect.arrayContaining(["read_game_state", "analyze_game_state", "launch_game"]),
    );
    for (const n of META_TOOL_NAMES) {
      expect(REGISTRY_TOOL_NAMES.has(n)).toBe(true);
      expect(STANDARD_TOOLS_BY_NAME[n].voiceExposed).toBe(true);
    }
  });

  it("does not contain execute_game_command", () => {
    expect(REGISTRY_TOOL_NAMES.has("execute_game_command")).toBe(false);
  });

  it("declarable names exclude meta + set_generated_image, include get_snapshot/generate_drawing", () => {
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("read_game_state");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("analyze_game_state");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("launch_game");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("set_generated_image");
    expect(DECLARABLE_CAPABILITY_NAMES).toContain("get_snapshot");
    expect(DECLARABLE_CAPABILITY_NAMES).toContain("generate_drawing");
  });

  it("generate_text is a declarable client tool delivering via set_generated_text", () => {
    const tool = STANDARD_TOOLS_BY_NAME["generate_text"];
    expect(tool.kind).toBe("client");
    expect(tool.voiceExposed).toBe(true);
    expect(tool.declarable).toBe(true);
    expect(tool.deliveryCommand).toBe("set_generated_text");
    expect(STANDARD_TOOLS_BY_NAME["generate_drawing"].deliveryCommand).toBe(
      "set_generated_image",
    );

    const delivery = STANDARD_TOOLS_BY_NAME["set_generated_text"];
    expect(delivery.kind).toBe("internal");
    expect(delivery.voiceExposed).toBe(false);
    expect(delivery.declarable).toBe(false);
    expect(DECLARABLE_CAPABILITY_NAMES).toContain("generate_text");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("set_generated_text");
  });
});

describe("buildGameToolDeclarations", () => {
  it("empty capabilities → only meta tools", () => {
    const names = buildGameToolDeclarations([]).map((t) => t.name);
    expect(names.sort()).toEqual([...META_TOOL_NAMES].sort());
  });

  it("registers opted-in game tools plus meta", () => {
    const names = buildGameToolDeclarations(["submit_answer", "next_task"]).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["submit_answer", "next_task", ...META_TOOL_NAMES]),
    );
    expect(names).not.toContain("generate_drawing");
    expect(names).not.toContain("generate_text");
  });

  it("generate_text capability registers the voice tool but never its delivery command", () => {
    const names = buildGameToolDeclarations(["generate_text"]).map((t) => t.name);
    expect(names).toContain("generate_text");
    expect(names).not.toContain("set_generated_text");
  });

  it("ignores unknown names and non-voice (internal) capabilities", () => {
    const names = buildGameToolDeclarations(["get_snapshot", "bogus_command"]).map((t) => t.name);
    expect(names).not.toContain("get_snapshot"); // internal → not a voice tool
    expect(names).not.toContain("bogus_command");
    expect(names.sort()).toEqual([...META_TOOL_NAMES].sort());
  });

  it("save_state capability registers the snapshot voice tools", () => {
    const names = buildGameToolDeclarations(["save_state"]).map((t) => t.name);
    expect(names).toContain("save_snapshot");
    expect(names).toContain("share_snapshot");
    expect(names).not.toContain("save_state"); // internal → not a voice tool itself
  });

  it("snapshot voice tools are absent without save_state", () => {
    const names = buildGameToolDeclarations(["submit_answer", "get_snapshot"]).map((t) => t.name);
    expect(names).not.toContain("save_snapshot");
    expect(names).not.toContain("share_snapshot");
  });
});

describe("snapshot tool registry entries", () => {
  it("save_state is declarable but never a voice tool; snapshot tools are the inverse", () => {
    expect(DECLARABLE_CAPABILITY_NAMES).toContain("save_state");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("save_snapshot");
    expect(DECLARABLE_CAPABILITY_NAMES).not.toContain("share_snapshot");
    expect(STANDARD_TOOLS_BY_NAME["save_state"].voiceExposed).toBe(false);
    expect(STANDARD_TOOLS_BY_NAME["save_snapshot"].kind).toBe("client");
    expect(STANDARD_TOOLS_BY_NAME["share_snapshot"].kind).toBe("client");
    expect(STANDARD_TOOLS_BY_NAME["save_snapshot"].requiresCapability).toBe("save_state");
    expect(STANDARD_TOOLS_BY_NAME["share_snapshot"].requiresCapability).toBe("save_state");
  });
});

describe("unknownCapabilities", () => {
  it("returns names not in the registry", () => {
    expect(unknownCapabilities(["submit_answer", "nope"])).toEqual(["nope"]);
    expect(unknownCapabilities(["set_drawing_color", "get_snapshot"])).toEqual([]);
  });
});

describe("standardCommandsDoc", () => {
  it("lists declarable commands but not meta tools", () => {
    const doc = standardCommandsDoc();
    expect(doc).toContain("submit_answer");
    expect(doc).toContain("generate_drawing");
    expect(doc).not.toContain("`launch_game`"); // meta excluded
  });

  it("teaches the contentSlots convention via the generate_text implementation note", () => {
    const doc = standardCommandsDoc(["generate_text"]);
    expect(doc).toContain("generate_text");
    expect(doc).toContain("contentSlots");
    expect(doc).toContain("set_generated_text");
    // Game-initiated trigger + one-slot-per-field rule are part of the contract.
    expect(doc).toContain("request_generate_text");
    expect(doc).toContain("ONE SLOT PER DISPLAYED FIELD");
  });

  it("filters to the given capabilities", () => {
    const doc = standardCommandsDoc(["submit_answer"]);
    expect(doc).toContain("submit_answer");
    expect(doc).not.toContain("place_item");
  });
});
