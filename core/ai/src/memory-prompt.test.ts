import { describe, expect, it } from "vitest";

import {
  applyDossierCitations,
  removeDossierCitations,
  appendSourceCitations,
  buildMemoryUpdateInstruction,
  clampMemoryDossier,
  MEMORY_MAX_WORDS,
  parseMemoryOpsResponse,
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

describe("parseMemoryOpsResponse", () => {
  it("parses creates/reinforces/discards/dossier", () => {
    const res = parseMemoryOpsResponse(
      JSON.stringify({
        creates: [
          {
            content: "Loves mango",
            category: "interests",
            transcript_entry_ids: ["e1", "e2"],
          },
        ],
        reinforces: [{ memory_id: "m1", transcript_entry_ids: ["e3"] }],
        discards: [
          {
            memory_id: "m2",
            transcript_entry_id: "e4",
            reason: "said they hate it",
          },
        ],
        dossier: "## Interests\n- Loves mango",
      }),
    );
    expect(res.creates).toHaveLength(1);
    expect(res.creates[0].transcriptEntryIds).toEqual(["e1", "e2"]);
    expect(res.reinforces[0].memoryId).toBe("m1");
    expect(res.discards[0].transcriptEntryId).toBe("e4");
    expect(res.dossier).toContain("Loves mango");
  });

  it("drops creates without entry ids", () => {
    const res = parseMemoryOpsResponse(
      JSON.stringify({
        creates: [{ content: "x", transcript_entry_ids: [] }],
        dossier: "d",
      }),
    );
    expect(res.creates).toEqual([]);
  });
});

describe("appendSourceCitations / applyDossierCitations", () => {
  it("appends [source:…] markers", () => {
    expect(appendSourceCitations("- Loves mango", ["aaa", "bbb"])).toBe(
      "- Loves mango [source:aaa] [source:bbb]",
    );
  });

  it("matches dossier lines to memory content", () => {
    const doc = applyDossierCitations("## Interests\n- Loves mango and sun\n- Other", [
      { content: "Loves mango and sun", sourceIds: ["s1"] },
    ]);
    expect(doc).toContain("[source:s1]");
    expect(doc).not.toMatch(/Other.*\[source:/);
  });
});

describe("removeDossierCitations", () => {
  const S1 = "11111111-1111-1111-1111-111111111111";
  const S2 = "22222222-2222-2222-2222-222222222222";

  it("drops a line whose ONLY citations were discarded", () => {
    const doc = `## Interests\n- Loves mango [source:${S1}]\n- Builds towers [source:${S2}]`;
    const out = removeDossierCitations(doc, [S1]);
    expect(out).not.toContain("mango");
    expect(out).toContain(`Builds towers [source:${S2}]`);
    expect(out).toContain("## Interests"); // uncited lines untouched
  });

  it("removes only the discarded marker from a line with other support", () => {
    const doc = `- Loves mango [source:${S1}] [source:${S2}]`;
    const out = removeDossierCitations(doc, [S1]);
    expect(out).toBe(`- Loves mango [source:${S2}]`);
  });

  it("is a no-op for empty input or no matching citations", () => {
    const doc = `- Loves mango [source:${S1}]`;
    expect(removeDossierCitations(doc, [])).toBe(doc);
    expect(removeDossierCitations(doc, [S2])).toBe(doc);
    expect(removeDossierCitations("", [S1])).toBe("");
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
