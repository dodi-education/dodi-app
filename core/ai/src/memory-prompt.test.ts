import { describe, expect, it } from "vitest";

import {
  buildMemoryUpdateInstruction,
  clampMemoryDossier,
  MEMORY_MAX_WORDS,
  parseMemoryUpdateResponse,
} from "./memory-prompt";

describe("buildMemoryUpdateInstruction", () => {
  const instruction = buildMemoryUpdateInstruction("SOUL-DOC");

  it("embeds the persona soul", () => {
    expect(instruction).toContain("SOUL-DOC");
  });

  it("requires ISO [YYYY-MM-DD] dates with a concrete example", () => {
    expect(instruction).toContain("[YYYY-MM-DD]");
    expect(instruction).toContain("[2026-06-22]");
  });

  it("forbids ambiguous date formats", () => {
    expect(instruction).toMatch(/never use ambiguous/i);
    expect(instruction).toContain("June 22");
  });

  it("dates from the transcript, not the (later) processing day", () => {
    expect(instruction).toMatch(/transcript'?s ISO timestamps/i);
    expect(instruction).toMatch(/NOT today's date/i);
  });

  it("describes the Session History as a chronological dated log", () => {
    expect(instruction).toContain("## Session History");
    expect(instruction).toMatch(/chronological/i);
  });
});

describe("parseMemoryUpdateResponse", () => {
  it("parses a plain JSON object", () => {
    const res = parseMemoryUpdateResponse(
      JSON.stringify({
        memory: "## About\n- [2026-06-22] Loves mango",
        stored: [{ observation: "mango", reason: "stated preference" }],
        discarded: [],
      }),
    );
    expect(res.memory).toContain("[2026-06-22]");
    expect(res.stored).toHaveLength(1);
    expect(res.discarded).toEqual([]);
  });

  it("parses JSON wrapped in markdown fences", () => {
    const res = parseMemoryUpdateResponse(
      '```json\n{"memory":"doc","stored":[],"discarded":[]}\n```',
    );
    expect(res.memory).toBe("doc");
  });

  it("falls back to the whole text when it is not valid JSON", () => {
    const res = parseMemoryUpdateResponse("## About\n- just markdown");
    expect(res.memory).toBe("## About\n- just markdown");
    expect(res.stored).toEqual([]);
    expect(res.discarded).toEqual([]);
  });

  it("defaults stored/discarded to arrays when absent", () => {
    const res = parseMemoryUpdateResponse(JSON.stringify({ memory: "doc" }));
    expect(res.stored).toEqual([]);
    expect(res.discarded).toEqual([]);
  });
});

describe("clampMemoryDossier", () => {
  it("leaves a dossier under the word cap unchanged", () => {
    const doc = "## About\n- Loves mango and dinosaurs";
    expect(clampMemoryDossier(doc)).toBe(doc);
  });

  it("clamps a dossier over the word cap to exactly the cap", () => {
    const doc = Array.from({ length: MEMORY_MAX_WORDS + 500 }, () => "word").join(" ");
    const out = clampMemoryDossier(doc);
    expect(out.split(/\s+/)).toHaveLength(MEMORY_MAX_WORDS);
  });

  it("returns empty for blank input", () => {
    expect(clampMemoryDossier("   ")).toBe("");
  });
});
