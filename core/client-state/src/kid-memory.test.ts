import { describe, expect, it } from "vitest";

import { encryptContent } from "@dodi/vault";

import {
  citationEntriesOf,
  discardKidMemory,
  loadKidMemories,
  parseCitationIds,
  saveKidMemory,
  tokenizeDossier,
  type MemoryRow,
} from "./kid-memory";
import { bodyOf, json, lockedVault, routedApi, spyKids, unlockedVault } from "./parent-pages.test-support";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("tokenizeDossier", () => {
  it("returns a single text token when there are no citations", () => {
    expect(tokenizeDossier("Loves dinosaurs.")).toEqual([{ type: "text", text: "Loves dinosaurs." }]);
  });

  it("numbers citations in reading order and reuses numbers per source", () => {
    const tokens = tokenizeDossier(`Likes cats [source:${A}] and dogs [source:${B}]. Cats again [source:${A.toUpperCase()}]`);
    expect(tokens).toEqual([
      { type: "text", text: "Likes cats" },
      { type: "citation", sourceId: A, num: 1 },
      { type: "text", text: " and dogs" },
      { type: "citation", sourceId: B, num: 2 },
      { type: "text", text: ". Cats again" },
      { type: "citation", sourceId: A, num: 1 },
    ]);
  });

  it("collects distinct citation ids", () => {
    expect(parseCitationIds(`x [source:${A}] y [source:${A}] [source:${B}]`)).toEqual([A, B]);
  });
});

describe("kid memory", () => {
  it("loads both lists decrypted and resolves citations (null while locked)", async () => {
    const { vault, session } = unlockedVault();
    const row = (id: string, text: string, sourceId: string) => ({
      id,
      content_enc: encryptContent(session, text),
      sources: [
        {
          id: sourceId,
          entry: { id: "e", role: "kid", content_enc: encryptContent(session, `said ${text}`), occurred_at: "2026-01-01T00:00:00Z" },
        },
      ],
    });
    const api = routedApi({
      "/api/kids/k1/memories?status=active&includeSources=1": json([row("m1", "likes cats", A)]),
      "/api/kids/k1/memories?status=discarded&includeSources=1": json([row("m2", "hates rain", B)]),
    });
    const lists = await loadKidMemories({ api, vault }, "k1");
    expect(lists?.active[0].content).toBe("likes cats");
    expect(lists?.discarded[0].content).toBe("hates rain");

    const entries = citationEntriesOf([...lists!.active, ...lists!.discarded], session);
    expect(entries.get(B)).toEqual({ role: "kid", text: "said hates rain", occurredAt: "2026-01-01T00:00:00Z" });
    expect(citationEntriesOf(lists!.active, null).size).toBe(0);

    await expect(loadKidMemories({ api, vault: lockedVault() }, "k1")).resolves.toBeNull();
  });

  it("saves notes (and the dossier only when edited), sealed", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidate } = spyKids();
    const api = routedApi({ "/api/kids/k1": json({}) });
    await saveKidMemory({ api, kids, vault }, "k1", { parentNotes: "Shy at first" });
    const first = bodyOf(api, "/api/kids/k1");
    expect(session.decryptField(first.parent_notes as string)).toBe("Shy at first");
    expect("memory" in first).toBe(false);

    await saveKidMemory({ api, kids, vault }, "k1", { parentNotes: "", memory: "" });
    expect(bodyOf(api, "/api/kids/k1", 1)).toEqual({ parent_notes: null, memory: null });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  const active = [{ id: "m1", sources: [{ id: A }] }] as unknown as MemoryRow[];
  const dossier = `Likes cats [source:${A}]\nLikes trains [source:${B}]`;

  it("discards a memory and saves the dossier without its citations", async () => {
    const { vault, session } = unlockedVault();
    const { kids } = spyKids();
    const api = routedApi({ "/api/kids/k1/memories": json({}), "/api/kids/k1": json({}) });
    const result = await discardKidMemory(
      { api, kids, vault },
      { kidId: "k1", memoryId: "m1", activeMemories: active, memory: dossier, isEditingMemory: false },
    );
    expect(bodyOf(api, "/api/kids/k1/memories")).toEqual({ memoryId: "m1", by: "parent" });
    expect(result.memory).not.toContain(A);
    expect(result.memory).toContain(B);
    expect(session.decryptField(bodyOf(api, "/api/kids/k1").memory as string)).toBe(result.memory);
    expect(result.isDossierSaveFailed).toBe(false);
  });

  it("only updates the text while the parent is editing; reports a failed dossier save", async () => {
    const { vault } = unlockedVault();
    const { kids } = spyKids();
    const input = { kidId: "k1", memoryId: "m1", activeMemories: active, memory: dossier };
    const editing = routedApi({ "/api/kids/k1/memories": json({}) });
    const result = await discardKidMemory({ api: editing, kids, vault }, { ...input, isEditingMemory: true });
    expect(result.memory).not.toContain(A);
    expect(editing.request).toHaveBeenCalledTimes(1);

    const failing = routedApi({ "/api/kids/k1/memories": json({}), "/api/kids/k1": json({}, 500) });
    const failed = await discardKidMemory({ api: failing, kids, vault }, { ...input, isEditingMemory: false });
    expect(failed.isDossierSaveFailed).toBe(true);

    const rejected = routedApi({ "/api/kids/k1/memories": json({}, 500) });
    await expect(
      discardKidMemory({ api: rejected, kids, vault }, { ...input, isEditingMemory: false }),
    ).rejects.toMatchObject({ reason: "request_failed" });
  });
});
