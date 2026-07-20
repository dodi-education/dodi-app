import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the DB-first transcript sync: rounds land in a tiny unsynced
 * outbox (localStorage) and an in-memory day model, are flushed (debounced) to
 * POST /transcripts with client-generated ids plus a re-encrypted full-day
 * mirror, and leave the outbox on ack. The day model is seeded from the stored
 * mirror by MERGE (never replace) — the regression class that silently dropped
 * every post-greeting round in the old flushDayToDb.
 *
 * Uses the real @dodi/vault mirror helpers with a stubbed cipher session, so
 * the mirror encode/decode round-trip is exercised for real.
 */

const { dodiRequestSpy, sessionRef, kidList } = vi.hoisted(() => ({
  dodiRequestSpy: vi.fn(),
  sessionRef: { current: null as unknown },
  kidList: {
    current: [] as Array<{ id: string; active_persona: { id: string } | null }>,
  },
}));

vi.mock("@/lib/api", () => ({ dodi: { request: dodiRequestSpy } }));
vi.mock("@/stores/vault-store", () => ({
  useVaultStore: { getState: () => ({ session: sessionRef.current }) },
}));
vi.mock("@/stores/kid-store", () => ({
  useKidStore: { getState: () => ({ list: kidList.current }) },
}));

import {
  beginDay,
  recordRound,
  syncAndSeed,
  flushNow,
  _resetForTests,
} from "@/lib/ai/transcript-sync";

// --- stub cipher session (real mirror helpers delegate to these) ------------

const fakeSession = {
  encryptField: (t: string) => `enc:${t}`,
  decryptField: (s: string | null) =>
    s == null ? null : s.startsWith("enc:") ? s.slice(4) : s,
  encryptJson: (v: unknown) => `encjson:${JSON.stringify(v)}`,
  decryptJson: (s: string | null | undefined) =>
    s && s.startsWith("encjson:") ? JSON.parse(s.slice(8)) : null,
};

interface MirrorEntry {
  id: string;
  role: "dodi" | "kid";
  text: string;
  occurred_at: string;
}

function makeMirrorBlob(entries: MirrorEntry[]): string {
  return `encjson:${JSON.stringify({ v: 1, entries })}`;
}

function decodeMirrorBlob(blob: string): MirrorEntry[] {
  return (JSON.parse(blob.slice("encjson:".length)) as { entries: MirrorEntry[] })
    .entries;
}

// --- request routing ---------------------------------------------------------

interface PostCapture {
  url: string;
  body: {
    localDate: string;
    personaId: string | null;
    contentEnc: string;
    entries: Array<{
      id: string;
      role: string;
      content_enc: string;
      occurred_at: string;
    }>;
  };
}

let posts: PostCapture[] = [];
let getCalls: string[] = [];
// Stored day rows by date, served to GET ?date=.
let dayRows: Record<string, { content_enc: string | null } | null> = {};
let postOk = true;
// When set, GETs park until the gate resolves (for the seed-merge race test).
let getGate: Promise<void> | null = null;

function installRequestRouter() {
  dodiRequestSpy.mockImplementation(
    async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(init.body!) });
        return { ok: postOk, status: postOk ? 201 : 500, json: async () => ({}) };
      }
      if (getGate) await getGate;
      const m = /date=(\d{4}-\d{2}-\d{2})/.exec(url);
      getCalls.push(m?.[1] ?? url);
      const row = m ? (dayRows[m[1]] ?? null) : null;
      return { ok: true, status: 200, json: async () => row };
    },
  );
}

// --- env ---------------------------------------------------------------------

function makeLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

const KID = "kid-1";
const DAY1_NOON = "2026-06-18T12:00:00.000Z"; // local day 2026-06-18 (UTC env)
const DAY2_NOON = "2026-06-19T12:00:00.000Z";

function readOutboxRaw(kid: string) {
  const raw = localStorage.getItem(`dodi-transcript-outbox-${kid}`);
  return raw
    ? (JSON.parse(raw) as { v: number; kidId: string; entries: unknown[] })
    : null;
}

const micro = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe("transcript-sync", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage =
      makeLocalStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DAY1_NOON));
    _resetForTests();
    posts = [];
    getCalls = [];
    dayRows = {};
    postOk = true;
    getGate = null;
    sessionRef.current = fakeSession;
    kidList.current = [{ id: KID, active_persona: { id: "persona-1" } }];
    dodiRequestSpy.mockReset();
    installRequestRouter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a round into the outbox with a uuid and the stamped local day", () => {
    beginDay(KID);
    recordRound({ role: "kid", text: "Ich liebe Mangos", occurredAt: DAY1_NOON });

    const outbox = readOutboxRaw(KID)!;
    expect(outbox.v).toBe(1);
    expect(outbox.entries).toHaveLength(1);
    expect(outbox.entries[0]).toMatchObject({
      role: "kid",
      text: "Ich liebe Mangos",
      occurredAt: DAY1_NOON,
      localDate: "2026-06-18",
    });
    expect((outbox.entries[0] as { id: string }).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("removes the legacy day-batch and pending keys at beginDay", () => {
    localStorage.setItem(`dodi-transcript-${KID}`, "{}");
    localStorage.setItem(`dodi-memory-pending-${KID}`, "{}");

    beginDay(KID);

    expect(localStorage.getItem(`dodi-transcript-${KID}`)).toBeNull();
    expect(localStorage.getItem(`dodi-memory-pending-${KID}`)).toBeNull();
  });

  it("flushes debounced: one POST with mirror + encrypted entries, outbox emptied on ack", async () => {
    beginDay(KID);
    recordRound({ role: "kid", text: "Ich liebe Mangos", occurredAt: DAY1_NOON });
    recordRound({
      role: "dodi",
      text: "Mangos sind super!",
      occurredAt: "2026-06-18T12:00:05.000Z",
    });
    expect(posts).toHaveLength(0); // debounced, nothing yet

    await vi.advanceTimersByTimeAsync(400);
    await micro();

    expect(posts).toHaveLength(1);
    const { url, body } = posts[0];
    expect(url).toBe(`/api/kids/${KID}/transcripts`);
    expect(body.localDate).toBe("2026-06-18");
    expect(body.personaId).toBe("persona-1");
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].content_enc).toBe("enc:Ich liebe Mangos");
    expect(body.entries[1].content_enc).toBe("enc:Mangos sind super!");

    // Mirror carries the same entries under the same client ids.
    const mirror = decodeMirrorBlob(body.contentEnc);
    expect(mirror.map((e) => e.id)).toEqual(body.entries.map((e) => e.id));
    expect(mirror.map((e) => e.text)).toEqual([
      "Ich liebe Mangos",
      "Mangos sind super!",
    ]);

    expect(readOutboxRaw(KID)).toBeNull(); // acked → gone
  });

  it("keeps the outbox on POST failure and retries with the SAME ids", async () => {
    postOk = false;
    beginDay(KID);
    recordRound({ role: "kid", text: "hallo", occurredAt: DAY1_NOON });

    await vi.advanceTimersByTimeAsync(400);
    await micro();

    expect(posts).toHaveLength(1);
    const firstIds = posts[0].body.entries.map((e) => e.id);
    expect(readOutboxRaw(KID)!.entries).toHaveLength(1); // retained

    postOk = true;
    await flushNow(KID);

    expect(posts).toHaveLength(2);
    expect(posts[1].body.entries.map((e) => e.id)).toEqual(firstIds);
    expect(readOutboxRaw(KID)).toBeNull();
  });

  it("seeds the day model from the stored mirror and re-uploads it merged + sorted", async () => {
    dayRows["2026-06-18"] = {
      content_enc: makeMirrorBlob([
        {
          id: "seed-1",
          role: "dodi",
          text: "Hallöchen!",
          occurred_at: "2026-06-18T08:00:00.000Z",
        },
      ]),
    };

    beginDay(KID);
    await syncAndSeed(KID);
    recordRound({ role: "kid", text: "Ich liebe Mangos", occurredAt: DAY1_NOON });
    await flushNow(KID);

    expect(posts).toHaveLength(1);
    const { body } = posts[0];
    // Only the NEW round travels as an entry row…
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].content_enc).toBe("enc:Ich liebe Mangos");
    // …but the mirror is the full day: seeded entry first (earlier), new after.
    const mirror = decodeMirrorBlob(body.contentEnc);
    expect(mirror.map((e) => e.id)).toEqual(["seed-1", body.entries[0].id]);
  });

  it("merges rounds recorded while the seed GET is in flight (replace-array regression)", async () => {
    let openGate!: () => void;
    getGate = new Promise<void>((r) => {
      openGate = r;
    });
    dayRows["2026-06-18"] = {
      content_enc: makeMirrorBlob([
        {
          id: "db-1",
          role: "dodi",
          text: "Kuckuck!",
          occurred_at: "2026-06-18T08:00:00.000Z",
        },
      ]),
    };

    beginDay(KID);
    const seeding = syncAndSeed(KID);
    // The kid speaks while the seed GET is still on the wire.
    recordRound({ role: "kid", text: "Ich liebe Mangos", occurredAt: DAY1_NOON });
    openGate();
    getGate = null;
    await seeding;
    await micro();

    // syncAndSeed's flush already POSTed; the mid-GET round must be in the
    // mirror alongside the DB entry — nothing orphaned, nothing replaced away.
    expect(posts).toHaveLength(1);
    const mirror = decodeMirrorBlob(posts[0].body.contentEnc);
    expect(mirror.map((e) => e.text)).toEqual(["Kuckuck!", "Ich liebe Mangos"]);
    expect(posts[0].body.entries).toHaveLength(1);
    expect(posts[0].body.entries[0].content_enc).toBe("enc:Ich liebe Mangos");
  });

  it("does not POST while the vault is locked, flushes after unlock", async () => {
    sessionRef.current = null;
    beginDay(KID);
    recordRound({ role: "kid", text: "geheim", occurredAt: DAY1_NOON });

    await vi.advanceTimersByTimeAsync(400);
    await micro();
    expect(posts).toHaveLength(0);
    expect(readOutboxRaw(KID)!.entries).toHaveLength(1); // waits locally

    sessionRef.current = fakeSession;
    await flushNow(KID);
    expect(posts).toHaveLength(1);
    expect(readOutboxRaw(KID)).toBeNull();
  });

  it("flushes a stale-day backlog to its own transcript via fetch-merge, then today's", async () => {
    // Crash on day 1: round recorded but never flushed (vault locked).
    sessionRef.current = null;
    beginDay(KID);
    recordRound({ role: "kid", text: "von gestern", occurredAt: DAY1_NOON });
    await vi.advanceTimersByTimeAsync(400);
    await micro();
    expect(posts).toHaveLength(0);

    // Next-day connect: unlocked, new round, flush everything.
    vi.setSystemTime(new Date(DAY2_NOON));
    sessionRef.current = fakeSession;
    dayRows["2026-06-18"] = {
      content_enc: makeMirrorBlob([
        {
          id: "old-1",
          role: "dodi",
          text: "Hallöchen!",
          occurred_at: "2026-06-18T08:00:00.000Z",
        },
      ]),
    };
    beginDay(KID);
    recordRound({ role: "kid", text: "von heute", occurredAt: DAY2_NOON });
    await flushNow(KID);

    expect(posts).toHaveLength(2);
    // Oldest day first, merged onto its stored mirror via GET ?date=.
    expect(posts[0].body.localDate).toBe("2026-06-18");
    expect(getCalls).toContain("2026-06-18");
    expect(decodeMirrorBlob(posts[0].body.contentEnc).map((e) => e.text)).toEqual([
      "Hallöchen!",
      "von gestern",
    ]);
    expect(posts[0].body.entries.map((e) => e.content_enc)).toEqual([
      "enc:von gestern",
    ]);
    // Then today's transcript with only today's round.
    expect(posts[1].body.localDate).toBe("2026-06-19");
    expect(posts[1].body.entries.map((e) => e.content_enc)).toEqual([
      "enc:von heute",
    ]);
    expect(readOutboxRaw(KID)).toBeNull();
  });

  it("stamps rounds after midnight with the new local day and resets the day model", async () => {
    beginDay(KID);
    recordRound({ role: "kid", text: "noch gestern", occurredAt: DAY1_NOON });
    await vi.advanceTimersByTimeAsync(400);
    await micro();
    expect(posts).toHaveLength(1);

    // Midnight passes while the session stays open.
    vi.setSystemTime(new Date(DAY2_NOON));
    recordRound({ role: "kid", text: "schon heute", occurredAt: DAY2_NOON });
    await flushNow(KID);

    expect(posts).toHaveLength(2);
    expect(posts[1].body.localDate).toBe("2026-06-19");
    // The new day's mirror starts fresh — yesterday's rounds stay in
    // yesterday's transcript and are not clobbered into today's.
    const mirror = decodeMirrorBlob(posts[1].body.contentEnc);
    expect(mirror.map((e) => e.text)).toEqual(["schon heute"]);
  });

  it("splits a >200-entry backlog into multiple POSTs (API entry cap)", async () => {
    sessionRef.current = null; // accumulate offline
    beginDay(KID);
    for (let i = 0; i < 201; i++) {
      recordRound({ role: "kid", text: `r-${i}`, occurredAt: DAY1_NOON });
    }

    sessionRef.current = fakeSession;
    await flushNow(KID);

    expect(posts).toHaveLength(2);
    expect(posts[0].body.entries).toHaveLength(200);
    expect(posts[1].body.entries).toHaveLength(1);
    expect(posts[1].body.localDate).toBe("2026-06-18");
    // Both chunks carry the same full-day mirror.
    expect(decodeMirrorBlob(posts[0].body.contentEnc)).toHaveLength(201);
    expect(decodeMirrorBlob(posts[1].body.contentEnc)).toHaveLength(201);
    expect(readOutboxRaw(KID)).toBeNull();
  });

  it("caps the outbox at 500 entries, dropping the oldest", () => {
    sessionRef.current = null; // keep everything local
    beginDay(KID);
    for (let i = 0; i < 501; i++) {
      recordRound({
        role: "kid",
        text: `round-${i}`,
        occurredAt: DAY1_NOON,
      });
    }

    const outbox = readOutboxRaw(KID)!;
    expect(outbox.entries).toHaveLength(500);
    expect((outbox.entries[0] as { text: string }).text).toBe("round-1");
    expect((outbox.entries[499] as { text: string }).text).toBe("round-500");
  });

  it("ignores empty/whitespace rounds", () => {
    beginDay(KID);
    recordRound({ role: "dodi", text: "   ", occurredAt: DAY1_NOON });
    expect(readOutboxRaw(KID)).toBeNull();
  });
});
