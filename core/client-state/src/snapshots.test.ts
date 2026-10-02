import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import {
  SNAPSHOT_EXPORT_ZIP_MAX_BYTES,
  SnapshotImportError,
} from "@dodi/protocol/snapshot-export";
import type { Kid } from "@dodi/types/database";
import type { GameSaveState } from "@dodi/types/games";
import { VaultSession } from "@dodi/vault";

import { createConnectivityStore } from "./connectivity-store";
import {
  type SnapshotDeps,
  type SnapshotOfflineCache,
  type SnapshotView,
  NO_SNAPSHOT_OFFLINE_CACHE,
  buildSnapshotContent,
  decodeSnapshotPayload,
  defaultSnapshotTitle,
  fetchAutosaveSnapshot,
  fetchSnapshots,
  isNewSnapshot,
  loadAccountSnapshots,
  loadKidSnapshots,
  resolveFriendForShare,
  sealOwnSnapshot,
  splitSnapshotSections,
  upsertAutosaveSnapshot,
} from "./snapshots";
import {
  buildSnapshotExportArchive,
  importSnapshot,
  parseSnapshotImportArchive,
  snapshotImportErrorKey,
  suggestImportKidId,
  unpackSnapshotExportZip,
} from "./snapshot-transfer";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const session = new VaultSession(new Uint8Array(32).fill(9));
const kid = { id: "kid-a", display_name: "Emma" } as Kid;
const sibling = { id: "kid-b", display_name: "Ben" } as Kid;

function content(title: string) {
  return buildSnapshotContent(
    {
      gameId: GAME_ID,
      gameTitle: "Castle",
      gameDescription: "Build it",
      gameMarkdown: "# doc",
      codeBundle: "<html><body>game</body></html>",
      capabilities: [],
      drawingStyle: "picture",
    },
    title,
    { tower: 2 } as unknown as GameSaveState,
    null,
    new Date("2026-05-01T10:00:00Z"),
  );
}

function view(id: string, fields: Partial<SnapshotView> = {}, title = id): SnapshotView & {
  payloadEnc: string;
} {
  const sealed = sealOwnSnapshot(session, content(title));
  return {
    id,
    origin: "own",
    gameId: GAME_ID,
    viewedAt: null,
    createdAt: "2026-05-01T10:00:00Z",
    senderKidId: null,
    senderSignPublicKey: null,
    sharedWithKidId: null,
    ...sealed,
    ...fields,
  };
}

function makeDeps(
  route: (url: string, init?: RequestInit) => { status: number; body?: unknown } | Error,
  offline: SnapshotOfflineCache = NO_SNAPSHOT_OFFLINE_CACHE,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const friends = {
    ensureFriendKeys: vi.fn(async () => ({}) as never),
    listFriends: vi.fn(async () => [
      {
        friendshipId: "f-1",
        counterpartKidId: "friend-x",
        status: "accepted",
        name: "Lea",
        nickname: null,
        counterpartKemPublicKey: "kem",
      },
      {
        friendshipId: "f-2",
        counterpartKidId: "friend-y",
        status: "pending",
        name: "Max",
        nickname: null,
        counterpartKemPublicKey: "kem2",
      },
    ]),
  };
  const connectivity = createConnectivityStore(true);
  const deps: SnapshotDeps = {
    api: {
      request: async (url, init) => {
        calls.push({ url, init });
        const result = route(url, init);
        if (result instanceof Error) throw result;
        return {
          ok: result.status < 400,
          status: result.status,
          json: async () => result.body ?? {},
        } as Response;
      },
    },
    connectivity,
    offline,
    friends,
  };
  return { deps, calls, friends, connectivity };
}

describe("collections", () => {
  it("loads a kid's own collection without touching friend keys", async () => {
    const { deps, friends } = makeDeps(() => ({ status: 200, body: [view("s1")] }));
    const loaded = await loadKidSnapshots(deps, kid, session, null);
    expect(loaded.snapshots[0].info?.title).toBe("s1");
    expect(loaded.keys).toBeNull();
    expect(friends.ensureFriendKeys).not.toHaveBeenCalled();
  });

  it("resolves sender names for received rows and remembers the keys", async () => {
    const received = view("s2", { origin: "received", senderKidId: "friend-x" });
    const { deps, friends } = makeDeps(() => ({ status: 200, body: [received] }));
    const loaded = await loadKidSnapshots(deps, kid, session, null);
    expect(friends.ensureFriendKeys).toHaveBeenCalledTimes(1);
    expect(loaded.snapshots[0].senderName).toBe("Lea");
    expect(loaded.keys?.kidId).toBe("kid-a");
    // Received blobs need the KEM key, so the fake keys can't open it.
    expect(loaded.snapshots[0].info).toBeNull();
  });

  it("merges the account overview newest first and drops own kids from friends", async () => {
    const { deps } = makeDeps((url) => {
      if (url.includes("kid-a")) {
        return {
          status: 200,
          body: [view("a1", { createdAt: "2026-01-01", sharedWithKidId: "kid-b" })],
        };
      }
      return {
        status: 200,
        body: [view("b1", { createdAt: "2026-02-01", origin: "received", senderKidId: "friend-x" })],
      };
    });
    const loaded = await loadAccountSnapshots(deps, [kid, sibling], session);
    expect(loaded.snapshots.map((s) => s.view.id)).toEqual(["b1", "a1"]);
    expect(loaded.snapshots[0].senderName).toBe("Lea");
    expect(loaded.friendKids).toEqual([{ id: "friend-x", name: "Lea" }]);
  });

  it("splits sections and flags new received rows", () => {
    const rows = [
      { view: view("x", { origin: "received" }) },
      { view: view("y") },
      { view: view("z", { origin: "autosave" }) },
    ];
    const { received, own } = splitSnapshotSections(rows);
    expect(received.map((r) => r.view.id)).toEqual(["x"]);
    expect(own.map((r) => r.view.id)).toEqual(["y"]);
    expect(isNewSnapshot(rows[0].view)).toBe(true);
    expect(isNewSnapshot({ origin: "received", viewedAt: "t" })).toBe(false);
    expect(isNewSnapshot(rows[1].view)).toBe(false);
  });
});

describe("offline fallbacks", () => {
  it("falls back to the cached list on a network error and reports offline", async () => {
    const cached = [view("c1")];
    const offline = { ...NO_SNAPSHOT_OFFLINE_CACHE, readSnapshotList: async () => cached as never };
    const { deps, connectivity } = makeDeps(() => new TypeError("fetch failed"), offline);
    await expect(fetchSnapshots(deps, "kid-a")).resolves.toBe(cached);
    expect(connectivity.getState().isOnline).toBe(false);
  });

  it("parks an autosave as pending while offline", async () => {
    const writePendingAutosave = vi.fn(async () => {});
    const offline = { ...NO_SNAPSHOT_OFFLINE_CACHE, writePendingAutosave };
    const { deps } = makeDeps(() => new TypeError("fetch failed"), offline);
    const input = { kidId: "kid-a", gameId: GAME_ID, infoEnc: "i", payloadEnc: "p", payloadBytes: 1 };
    await expect(upsertAutosaveSnapshot(deps, input)).resolves.toEqual({ id: null, pending: true });
    expect(writePendingAutosave).toHaveBeenCalledWith("kid-a", GAME_ID, input);
  });

  it("treats a 404 autosave slot as none", async () => {
    const { deps } = makeDeps(() => ({ status: 404, body: { error: "nope" } }));
    await expect(fetchAutosaveSnapshot(deps, "kid-a", GAME_ID)).resolves.toBeNull();
  });
});

describe("share resolution", () => {
  it("matches accepted friends only and lists candidates otherwise", async () => {
    const { deps } = makeDeps(() => ({ status: 200 }));
    await expect(resolveFriendForShare(deps, kid, session, " lea ")).resolves.toMatchObject({
      kind: "ok",
      friendshipId: "f-1",
      counterpartKidId: "friend-x",
      displayName: "Lea",
    });
    await expect(resolveFriendForShare(deps, kid, session, "Max")).resolves.toEqual({
      kind: "unknown",
      candidates: ["Lea"],
    });
  });
});

describe("export / import", () => {
  it("round-trips a snapshot through the archive and re-seals it on import", async () => {
    const detail = view("s1", {}, "Tower");
    const { deps, calls } = makeDeps((url, init) =>
      init?.method === "POST" ? { status: 200, body: { id: "new", createdAt: "x" } } : { status: 200, body: detail },
    );
    const info = content("Tower").info;
    const archive = await buildSnapshotExportArchive(deps, {
      snapshot: {
        view: detail,
        kidId: "kid-a",
        kidName: "Emma",
        info,
        senderName: null,
        sentToName: null,
      },
      kid,
      session,
      appVersion: "test",
    });
    expect(archive.fileName.endsWith(".dodi-snap.zip")).toBe(true);

    const parsed = parseSnapshotImportArchive(archive.bytes);
    expect(parsed.manifest.kidName).toBe("Emma");
    expect(suggestImportKidId(parsed, [{ id: "k2", name: "emma" }, { id: "k3", name: "Ben" }])).toBe("k2");
    expect(suggestImportKidId(parsed, [{ id: "k3", name: "Ben" }])).toBe("k3");
    expect(suggestImportKidId(parsed, [{ id: "k3", name: "Ben" }, { id: "k4", name: "Al" }])).toBeNull();

    await importSnapshot(deps, { parsed, kidId: "k2", session });
    const post = calls.find((c) => c.init?.method === "POST");
    const body = JSON.parse(post?.init?.body as string) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["kidId", "gameId", "infoEnc", "payloadEnc", "payloadBytes"]);
    expect(body.gameId).toBeNull();
    const reopened = decodeSnapshotPayload(
      { ...detail, infoEnc: body.infoEnc as string, payloadEnc: body.payloadEnc as string },
      session,
      null,
    );
    expect(reopened.payload.savedState).toEqual({ tower: 2 });
  });

  it("maps archive errors to message keys", () => {
    expect(() => unpackSnapshotExportZip(new Uint8Array(SNAPSHOT_EXPORT_ZIP_MAX_BYTES + 1))).toThrow(
      SnapshotImportError,
    );
    let caught: unknown;
    try {
      parseSnapshotImportArchive(zipSync({ "game.html": new Uint8Array([60]) }));
    } catch (error) {
      caught = error;
    }
    expect(snapshotImportErrorKey(caught)).toBe("importErrManifest");
    expect(snapshotImportErrorKey(new Error("x"))).toBe("importErrArchiveInvalid");
  });
});

describe("titles", () => {
  it("defaults to the game title and the date", () => {
    const now = new Date("2026-05-01T10:00:00Z");
    expect(defaultSnapshotTitle("Castle", now)).toBe(`Castle · ${now.toLocaleDateString()}`);
  });
});
