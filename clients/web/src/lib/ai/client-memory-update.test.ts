import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the DB-first memory write. `runClientMemoryUpdate` reads open
 * day transcripts, decrypts ONE content_enc mirror per day (no entry fetch),
 * closes greeting-only days without a model call, and must return `true` ONLY
 * when the confirmed writes landed (or there was nothing to do) and `false`
 * (never throw) for every "can't process now" condition.
 */

const {
  loadOne,
  invalidate,
  getKey,
  vaultState,
  provider,
  dodiRequest,
} = vi.hoisted(() => ({
  loadOne: vi.fn(),
  invalidate: vi.fn(),
  getKey: vi.fn(),
  vaultState: { session: {} as unknown },
  provider: { generateJson: vi.fn(), generateText: vi.fn() },
  dodiRequest: vi.fn(),
}));

vi.mock("@/stores/kid-store", () => ({
  useKidStore: { getState: () => ({ loadOne, invalidate }) },
}));

vi.mock("@/stores/providers-store", () => ({
  useProvidersStore: {
    getState: () => ({ providers: { gemini: {} }, load: async () => {}, getKey }),
  },
}));

vi.mock("@/stores/vault-store", () => ({
  useVaultStore: { getState: () => ({ session: vaultState.session }) },
}));

vi.mock("@/lib/ai/voice-session", () => ({
  getActivePersona: async () => ({ soul: "SOUL" }),
}));

vi.mock("@/lib/api", () => ({
  dodi: { request: (...args: unknown[]) => dodiRequest(...args) },
}));

vi.mock("@dodi/vault", () => ({
  encryptKidFields: (_s: unknown, fields: { memory?: string | null }) => ({
    memory: `enc:${fields.memory}`,
  }),
  encryptContent: (_s: unknown, t: string) => `enc:${t}`,
  decryptContent: (_s: unknown, t: string) =>
    typeof t === "string" && t.startsWith("enc:") ? t.slice(4) : t,
  decryptTranscriptMirror: (_s: unknown, blob: string | null | undefined) =>
    typeof blob === "string" && blob.startsWith("mirror:")
      ? JSON.parse(blob.slice(7))
      : null,
}));

vi.mock("@dodi/ai/client-thinking", () => ({
  createClientThinkingProvider: () => provider,
}));

import { runClientMemoryUpdate } from "@/lib/ai/client-memory-update";

const KID = { id: "pid", memory: null, active_persona: null };

const FULL_CONFIG = {
  voiceProvider: "gemini",
  voiceModel: "gemini-live",
  voiceName: "Puck",
  thinkingProvider: "gemini",
  thinkingModel: "gemini-3.5-flash",
};

interface MirrorEntry {
  id: string;
  role: "dodi" | "kid";
  text: string;
  occurred_at: string;
}

/** A transcript day row as returned by GET ?status=open. */
function day(
  id: string,
  localDate: string,
  entries: MirrorEntry[] | "corrupt" | null,
) {
  return {
    id,
    local_date: localDate,
    status: "open",
    content_enc:
      entries === null
        ? null
        : entries === "corrupt"
          ? "garbage-blob"
          : `mirror:${JSON.stringify(entries)}`,
  };
}

const KID_ENTRY: MirrorEntry = {
  id: "e-kid-1",
  role: "kid",
  text: "Ich liebe Mangos",
  occurred_at: "2026-06-18T12:00:00.000Z",
};
const DODI_ENTRY: MirrorEntry = {
  id: "e-dodi-1",
  role: "dodi",
  text: "Hallöchen!",
  occurred_at: "2026-06-18T08:00:00.000Z",
};

const TODAY = new Date().toLocaleDateString("en-CA");

function routeDodi(opts: {
  config?: unknown;
  patchOk?: boolean;
  transcripts?: unknown[];
  memories?: unknown[];
  syncOk?: boolean;
} = {}) {
  const {
    config = FULL_CONFIG,
    patchOk = true,
    transcripts = [],
    memories = [],
    syncOk = true,
  } = opts;

  dodiRequest.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url === "/api/ai/config") {
      return { ok: true, json: async () => config };
    }
    if (url.includes("/memory-sync")) {
      return {
        ok: syncOk,
        json: async () => ({ created: [], reinforced: [], discarded: [] }),
      };
    }
    if (url.includes("/transcripts")) {
      return { ok: true, json: async () => transcripts };
    }
    if (url.includes("/memories")) {
      return { ok: true, json: async () => memories };
    }
    if (url.startsWith("/api/kids/") && init?.method === "PATCH") {
      return { ok: patchOk, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

const syncCalls = () =>
  dodiRequest.mock.calls
    .filter((c) => String(c[0]).includes("/memory-sync"))
    .map(
      (c) =>
        JSON.parse((c[1] as { body: string }).body) as {
          creates?: Array<{ sources: Array<{ transcript_entry_id: string }> }>;
          markProcessedTranscriptIds: string[];
        },
    );

describe("runClientMemoryUpdate", () => {
  beforeEach(() => {
    vaultState.session = { encryptField: (s: string) => s };
    loadOne.mockResolvedValue(KID);
    getKey.mockReturnValue("AIza-key");
    provider.generateJson.mockResolvedValue({
      creates: [],
      reinforces: [],
      discards: [],
      dossier: "NEW DOSSIER",
    });
    provider.generateText.mockResolvedValue(
      JSON.stringify({
        creates: [],
        reinforces: [],
        discards: [],
        dossier: "NEW DOSSIER",
      }),
    );
    routeDodi();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("processes a past day from its mirror: entry_id prompt lines, sync, dossier PATCH", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [DODI_ENTRY, KID_ENTRY])],
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);

    // Prompt is built from the decrypted mirror — one blob, no entry fetch.
    const prompt = provider.generateJson.mock.calls[0][1] as string;
    expect(prompt).toContain("### Day 2026-06-18 (transcript t1)");
    expect(prompt).toContain("entry_id=e-kid-1");
    expect(prompt).toContain("Kid: Ich liebe Mangos");

    // The day is marked processed and the dossier PATCHed.
    expect(syncCalls()[0].markProcessedTranscriptIds).toEqual(["t1"]);
    const patchCall = dodiRequest.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/kids/pid" &&
        (c[1] as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(JSON.parse((patchCall![1] as { body: string }).body)).toEqual({
      memory: "enc:NEW DOSSIER",
    });
  });

  it("filters model citations down to entry ids that exist in the mirrors", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [KID_ENTRY])],
    });
    provider.generateJson.mockResolvedValue({
      creates: [
        {
          content: "Loves mangos",
          category: "interest",
          transcript_entry_ids: ["e-kid-1", "hallucinated-id"],
        },
        {
          content: "Only fabricated evidence",
          transcript_entry_ids: ["another-fake"],
        },
      ],
      reinforces: [],
      discards: [],
      dossier: "NEW DOSSIER",
    });

    await runClientMemoryUpdate("pid");

    const sync = syncCalls()[0];
    expect(sync.creates).toHaveLength(1); // fully-fabricated create dropped
    expect(sync.creates![0].sources.map((s) => s.transcript_entry_id)).toEqual([
      "e-kid-1", // hallucinated id filtered out
    ]);
  });

  it("closes greeting-only days without a model call", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [DODI_ENTRY])],
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(true);
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(provider.generateText).not.toHaveBeenCalled();
    expect(syncCalls()[0].markProcessedTranscriptIds).toEqual(["t1"]);
    // No dossier PATCH on the trivial-only path.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("skips today's transcript by default, includes it with includeToday", async () => {
    routeDodi({ transcripts: [day("t-today", TODAY, [KID_ENTRY])] });

    expect(await runClientMemoryUpdate("pid")).toBe(true);
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(syncCalls()).toHaveLength(0); // untouched — still today

    expect(await runClientMemoryUpdate("pid", { includeToday: true })).toBe(true);
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(syncCalls()[0].markProcessedTranscriptIds).toEqual(["t-today"]);
  });

  it("skips a corrupted mirror day (left open) while processing the others", async () => {
    routeDodi({
      transcripts: [
        day("t-bad", "2026-06-17", "corrupt"),
        day("t-good", "2026-06-18", [KID_ENTRY]),
      ],
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(true);
    const sync = syncCalls()[0];
    expect(sync.markProcessedTranscriptIds).toEqual(["t-good"]); // t-bad NOT closed
    const prompt = provider.generateJson.mock.calls[0][1] as string;
    expect(prompt).not.toContain("t-bad");
  });

  it("returns false when the memory-sync write fails", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [KID_ENTRY])],
      syncOk: false,
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns false and does not invalidate when the dossier PATCH fails", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [KID_ENTRY])],
      patchOk: false,
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns false (not throw) when the vault is terminally locked", async () => {
    loadOne.mockRejectedValueOnce(new Error("Vault is locked"));

    await expect(runClientMemoryUpdate("pid")).resolves.toBe(false);
  });

  it("returns false when the session is missing after load (defensive)", async () => {
    vaultState.session = null;

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(false);
  });

  it("returns false and skips kids writes when no thinking provider is configured", async () => {
    routeDodi({
      transcripts: [day("t1", "2026-06-18", [KID_ENTRY])],
      config: { voiceProvider: "gemini", voiceModel: "x", voiceName: "Puck" },
    });

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(false);
    const calledKidsWrite = dodiRequest.mock.calls.some(
      (c) =>
        String(c[0]).includes("/api/kids/") &&
        (c[1] as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(calledKidsWrite).toBe(false);
  });

  it("returns false when the thinking provider has no API key in the vault", async () => {
    routeDodi({ transcripts: [day("t1", "2026-06-18", [KID_ENTRY])] });
    getKey.mockReturnValue(null);

    const ok = await runClientMemoryUpdate("pid");

    expect(ok).toBe(false);
  });

  it("returns true with nothing to process when no open days exist", async () => {
    const ok = await runClientMemoryUpdate("pid");
    expect(ok).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
