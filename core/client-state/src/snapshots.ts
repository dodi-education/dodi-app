/**
 * Snapshots: the platform API, E2EE decode and the collection loaders, shared
 * by the web and the app (each binds its own deps once).
 *
 * A snapshot row carries two opaque sealed blobs: the light `info` (title,
 * game title, thumbnail; decrypted to render the collection) and the heavy
 * `payload` (game code + metadata + restorable save state; fetched on open).
 * Own rows are sealed under the account VMK; received rows are SealedEnvelope
 * JSON sealed to this kid's friend KEM key and signed by the sender kid, whose
 * published signing key the server delivers alongside for verification.
 *
 * Offline: a device may keep a ciphertext cache (web: IndexedDB). Network
 * failures fall back to it and park autosave uploads as pending records; an
 * app without one passes {@link NO_SNAPSHOT_OFFLINE_CACHE}.
 */
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import {
  estimateSnapshotPayloadBytes,
  openOwnSnapshotInfo,
  openOwnSnapshotPayload,
  openSharedSnapshotInfo,
  openSharedSnapshotPayload,
  sealOwnSnapshotInfo,
  sealOwnSnapshotPayload,
  type KidFriendKeys,
} from "@dodi/protocol";
import type { Kid, SnapshotOrigin } from "@dodi/types/database";
import type {
  DrawingStyle,
  GameSaveState,
  SnapshotInfoV1,
  SnapshotPayloadV1,
} from "@dodi/types/games";
import type { VaultSession } from "@dodi/vault";

import type { ConnectivityStore } from "./connectivity-store";
import { decodeView, ensureFriendKeys, fetchFriends } from "./friends";
import type { PlatformApi } from "./platform";

export interface SnapshotView {
  id: string;
  origin: SnapshotOrigin;
  gameId: string | null;
  infoEnc: string;
  payloadBytes: number;
  viewedAt: string | null;
  createdAt: string;
  senderKidId: string | null;
  /** Sender kid's published signing key: verifies the sealed blobs. */
  senderSignPublicKey: string | null;
  /** On own rows created by sharing: the friend kid the copy was sent to. */
  sharedWithKidId: string | null;
}

export interface SnapshotDetailView extends SnapshotView {
  payloadEnc: string;
}

export class SnapshotsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SnapshotsError";
  }
}

/** The device's ciphertext cache for snapshots (best-effort, never throws). */
export interface SnapshotOfflineCache {
  writeSnapshotList(kidId: string, views: unknown[]): Promise<void>;
  readSnapshotList<T>(kidId: string): Promise<T[] | null>;
  writeSnapshotPayload(id: string, detail: unknown, payloadBytes: number): Promise<void>;
  readSnapshotPayload<T>(id: string): Promise<T | null>;
  cachedSnapshotPayloadIds(): Promise<Set<string>>;
  writeAutosave(kidId: string, gameId: string, detail: unknown): Promise<void>;
  readAutosave<T>(kidId: string, gameId: string): Promise<T | null>;
  writePendingAutosave(kidId: string, gameId: string, input: unknown): Promise<void>;
  readPendingAutosave<T>(kidId: string, gameId: string): Promise<T | null>;
  readPendingAutosaves<T>(): Promise<T[]>;
  deletePendingAutosave(kidId: string, gameId: string): Promise<void>;
}

/** No offline cache: every read misses, writes are dropped. */
export const NO_SNAPSHOT_OFFLINE_CACHE: SnapshotOfflineCache = {
  writeSnapshotList: async () => {},
  readSnapshotList: async () => null,
  writeSnapshotPayload: async () => {},
  readSnapshotPayload: async () => null,
  cachedSnapshotPayloadIds: async () => new Set(),
  writeAutosave: async () => {},
  readAutosave: async () => null,
  writePendingAutosave: async () => {},
  readPendingAutosave: async () => null,
  readPendingAutosaves: async () => [],
  deletePendingAutosave: async () => {},
};

/** One of the kid's friendships, its card opened on the device. */
export interface SnapshotFriend {
  friendshipId: string;
  counterpartKidId: string;
  status: string;
  /** Counterpart's name from their sealed card (null until delivered / unreadable). */
  name: string | null;
  /** This kid's own private label for the friend. */
  nickname: string | null;
  counterpartKemPublicKey: string | null;
}

/** The friends layer snapshots need (keys for received rows, names, share targets). */
export interface SnapshotFriendsPort {
  /** The kid's friend keys; generated + published on first use. */
  ensureFriendKeys(kid: Kid, session: VaultSession): Promise<KidFriendKeys>;
  /** The kid's friendships with their cards decoded. */
  listFriends(kid: Kid, keys: KidFriendKeys, session: VaultSession): Promise<SnapshotFriend[]>;
}

/** The friends port over the shared friends layer (`./friends`). */
export function snapshotFriendsPort(api: PlatformApi): SnapshotFriendsPort {
  return {
    ensureFriendKeys: (kid, session) => ensureFriendKeys(api, kid, session),
    listFriends: async (kid, keys, session) =>
      (await fetchFriends(api, kid.id)).map((view) => {
        const decoded = decodeView(view, keys, session);
        return {
          friendshipId: decoded.id,
          counterpartKidId: view.counterpartKidId,
          status: view.status,
          name: decoded.name,
          nickname: decoded.nickname,
          counterpartKemPublicKey: view.counterpartKemPublicKey,
        };
      }),
  };
}

export interface SnapshotDeps {
  api: Pick<PlatformApi, "request">;
  connectivity: ConnectivityStore;
  offline: SnapshotOfflineCache;
  friends: SnapshotFriendsPort;
}

async function jsonRequest<T>(
  deps: Pick<SnapshotDeps, "api">,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await deps.api.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new SnapshotsError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function reportOffline(deps: Pick<SnapshotDeps, "connectivity">): void {
  deps.connectivity.getState().reportOffline();
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function fetchSnapshots(
  deps: SnapshotDeps,
  kidId: string,
  opts?: { includeAutosave?: boolean },
): Promise<SnapshotView[]> {
  const params = new URLSearchParams({ kidId });
  if (opts?.includeAutosave) params.set("includeAutosave", "1");
  try {
    const views = await jsonRequest<SnapshotView[]>(deps, `/api/snapshots?${params.toString()}`);
    // Only the default collection is cached: the autosave-including variant
    // is a superset used by internal flows.
    if (!opts?.includeAutosave) void deps.offline.writeSnapshotList(kidId, views);
    return views;
  } catch (error) {
    if (!(error instanceof TypeError) || opts?.includeAutosave) throw error;
    const cached = await deps.offline.readSnapshotList<SnapshotView>(kidId);
    if (!cached) throw error;
    reportOffline(deps);
    return cached;
  }
}

export async function fetchSnapshot(deps: SnapshotDeps, id: string): Promise<SnapshotDetailView> {
  try {
    const detail = await jsonRequest<SnapshotDetailView>(
      deps,
      `/api/snapshots/${encodeURIComponent(id)}`,
    );
    void deps.offline.writeSnapshotPayload(id, detail, detail.payloadBytes);
    return detail;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const cached = await deps.offline.readSnapshotPayload<SnapshotDetailView>(id);
    if (!cached) throw error;
    reportOffline(deps);
    return cached;
  }
}

/**
 * Background-fill the offline payload cache from a freshly fetched collection.
 * Sequential and skip-if-present; iterates oldest-first so the NEWEST
 * snapshots are written last and survive the cache's LRU budget.
 */
export async function prefetchSnapshotPayloadsForOffline(
  deps: SnapshotDeps,
  views: SnapshotView[],
): Promise<void> {
  const PREFETCH_LIMIT = 20;
  try {
    const cachedIds = await deps.offline.cachedSnapshotPayloadIds();
    const candidates = views
      .filter((v) => !cachedIds.has(v.id))
      .slice(0, PREFETCH_LIMIT)
      .reverse();
    for (const view of candidates) {
      await fetchSnapshot(deps, view.id);
    }
  } catch {
    // Prefetch is opportunistic: the collection still works online.
  }
}

export interface CreateOwnSnapshotInput {
  kidId: string;
  gameId: string | null;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
  /** The friend kid this copy was sent to when created by sharing. */
  sharedWithKidId?: string | null;
}

export function createOwnSnapshot(
  deps: Pick<SnapshotDeps, "api">,
  input: CreateOwnSnapshotInput,
): Promise<{ id: string; createdAt: string }> {
  return jsonRequest(deps, "/api/snapshots", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface ShareSnapshotInput {
  senderKidId: string;
  friendshipId: string;
  /** The sender's source game (soft reference on the received row). */
  gameId: string | null;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
}

export function shareSnapshotWithFriend(
  deps: Pick<SnapshotDeps, "api">,
  input: ShareSnapshotInput,
): Promise<{ id: string }> {
  return jsonRequest(deps, "/api/snapshots/share", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UpsertAutosaveInput {
  kidId: string;
  gameId: string;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
}

/**
 * Overwrite (or create) the kid's single autosave slot for a game. A
 * network-level failure parks the sealed upload as a PENDING record (flushed
 * by {@link flushPendingAutosaves}) instead of throwing, so offline progress
 * survives; other errors rethrow.
 */
export async function upsertAutosaveSnapshot(
  deps: SnapshotDeps,
  input: UpsertAutosaveInput,
): Promise<{ id: string } | { id: null; pending: true }> {
  try {
    const result = await jsonRequest<{ id: string }>(deps, "/api/snapshots/autosave", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    void deps.offline.deletePendingAutosave(input.kidId, input.gameId);
    return result;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    reportOffline(deps);
    await deps.offline.writePendingAutosave(input.kidId, input.gameId, input);
    return { id: null, pending: true };
  }
}

/** A pending (not-yet-uploaded) autosave rendered as a detail view. */
function pendingAutosaveDetail(input: UpsertAutosaveInput): SnapshotDetailView {
  return {
    id: `pending-autosave:${input.kidId}:${input.gameId}`,
    origin: "autosave",
    gameId: input.gameId,
    infoEnc: input.infoEnc,
    payloadEnc: input.payloadEnc,
    payloadBytes: input.payloadBytes,
    viewedAt: null,
    createdAt: new Date().toISOString(),
    senderKidId: null,
    senderSignPublicKey: null,
    sharedWithKidId: null,
  };
}

/**
 * The kid's autosave slot for a game, or null when none exists yet.
 * Resolution order: pending offline upload (always the newest state, even
 * when back online before the flush ran) → network (write-through to the
 * offline cache) → cached copy (network unreachable).
 */
export async function fetchAutosaveSnapshot(
  deps: SnapshotDeps,
  kidId: string,
  gameId: string,
): Promise<SnapshotDetailView | null> {
  const pending = await deps.offline.readPendingAutosave<UpsertAutosaveInput>(kidId, gameId);
  if (pending) return pendingAutosaveDetail(pending);
  try {
    const detail = await jsonRequest<SnapshotDetailView>(
      deps,
      `/api/snapshots/autosave?kidId=${encodeURIComponent(kidId)}&gameId=${encodeURIComponent(gameId)}`,
    );
    void deps.offline.writeAutosave(kidId, gameId, detail);
    return detail;
  } catch (error) {
    if (error instanceof SnapshotsError && error.status === 404) return null;
    if (!(error instanceof TypeError)) throw error;
    const cached = await deps.offline.readAutosave<SnapshotDetailView>(kidId, gameId);
    if (!cached) throw error;
    reportOffline(deps);
    return cached;
  }
}

/**
 * Upload autosaves parked while offline (oldest first). Stops at the first
 * failure: a later online signal retries. Triggered from the kid chrome on
 * mount and on every offline→online transition.
 */
export async function flushPendingAutosaves(deps: SnapshotDeps): Promise<void> {
  const pending = await deps.offline.readPendingAutosaves<UpsertAutosaveInput>();
  for (const input of pending) {
    try {
      await jsonRequest<{ id: string }>(deps, "/api/snapshots/autosave", {
        method: "PUT",
        body: JSON.stringify(input),
      });
      await deps.offline.deletePendingAutosave(input.kidId, input.gameId);
    } catch {
      return;
    }
  }
}

export function deleteSnapshot(
  deps: Pick<SnapshotDeps, "api">,
  id: string,
): Promise<{ ok: boolean }> {
  return jsonRequest(deps, `/api/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function markSnapshotViewed(
  deps: Pick<SnapshotDeps, "api">,
  id: string,
): Promise<{ ok: boolean }> {
  return jsonRequest(deps, `/api/snapshots/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ viewed: true }),
  });
}

// ---------------------------------------------------------------------------
// E2EE decode
// ---------------------------------------------------------------------------

/**
 * Decrypt a snapshot's gallery info. `kidKeys` is only needed for received
 * rows (null is fine for a collection with own rows only). Returns null when
 * the blob can't be opened (wrong keys / tampered): the gallery renders a
 * fallback card.
 */
export function decodeSnapshotInfo(
  view: SnapshotView,
  session: VaultSession,
  kidKeys: KidFriendKeys | null,
): SnapshotInfoV1 | null {
  try {
    if (view.origin === "received") {
      if (!kidKeys) return null;
      return openSharedSnapshotInfo(
        kidKeys.kem.secretKey,
        view.infoEnc,
        view.senderSignPublicKey ?? undefined,
      );
    }
    return openOwnSnapshotInfo(session, view.infoEnc);
  } catch {
    return null;
  }
}

export interface DecodedSnapshotPayload {
  payload: SnapshotPayloadV1;
  /** Re-sanitized game code: the ONLY code that may reach the sandbox. */
  sanitizedCode: string;
}

/**
 * Decrypt + validate a snapshot's full payload and re-sanitize the embedded
 * game code (defense in depth: a received payload originates from another
 * family's client). Throws when the blob can't be opened or the code is unsafe.
 */
export function decodeSnapshotPayload(
  view: SnapshotDetailView,
  session: VaultSession,
  kidKeys: KidFriendKeys | null,
): DecodedSnapshotPayload {
  if (view.origin === "received" && !kidKeys) {
    throw new Error("friend keys are required to open a received snapshot");
  }
  const payload =
    view.origin === "received" && kidKeys
      ? openSharedSnapshotPayload(
          kidKeys.kem.secretKey,
          view.payloadEnc,
          view.senderSignPublicKey ?? undefined,
        )
      : openOwnSnapshotPayload(session, view.payloadEnc);
  const sanitizedCode = sanitizeGameBundle(payload.codeBundle).code;
  return { payload, sanitizedCode };
}

/**
 * Open a snapshot's payload for play/export: received rows need the owning
 * kid's friend keys (generated on first use), own rows the vault.
 */
export async function openSnapshotPayload(
  deps: SnapshotDeps,
  detail: SnapshotDetailView,
  kid: Kid | null,
  session: VaultSession,
): Promise<DecodedSnapshotPayload> {
  const keys =
    detail.origin === "received" && kid ? await deps.friends.ensureFriendKeys(kid, session) : null;
  return decodeSnapshotPayload(detail, session, keys);
}

/** A received snapshot the kid hasn't opened yet (the "new" badge). */
export function isNewSnapshot(view: Pick<SnapshotView, "origin" | "viewedAt">): boolean {
  return view.origin === "received" && !view.viewedAt;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface DecodedSnapshot {
  view: SnapshotView;
  /** Null = blob unreadable (wrong keys / tampered): render a fallback card. */
  info: SnapshotInfoV1 | null;
  /** Decrypted sender name for received snapshots ("from Lea"). */
  senderName: string | null;
}

/** Friend keys remembered for one specific kid. */
export interface CachedFriendKeys {
  kidId: string;
  keys: KidFriendKeys;
}

/**
 * Load and decrypt a kid's snapshot collection (own + received). Friend keys
 * are only touched when received rows exist: browsing your own snapshots never
 * generates/publishes a friend identity as a side effect. `cachedKeys` from a
 * previous load are reused only when they belong to the same kid; the keys in
 * use come back for the caller to remember.
 */
export async function loadKidSnapshots(
  deps: SnapshotDeps,
  kid: Kid,
  session: VaultSession,
  cachedKeys: CachedFriendKeys | null,
): Promise<{ snapshots: DecodedSnapshot[]; keys: CachedFriendKeys | null }> {
  const views = await fetchSnapshots(deps, kid.id);
  // Background-fill the offline payload cache (skip-if-present; no-ops when
  // the list itself came from the offline cache).
  void prefetchSnapshotPayloadsForOffline(deps, views);

  const hasReceived = views.some((v) => v.origin === "received");
  let keys = cachedKeys && cachedKeys.kidId === kid.id ? cachedKeys.keys : null;
  let remembered: CachedFriendKeys | null = keys ? { kidId: kid.id, keys } : null;
  const senderNames = new Map<string, string>();
  if (hasReceived) {
    keys = keys ?? (await deps.friends.ensureFriendKeys(kid, session));
    remembered = { kidId: kid.id, keys };
    // Sender names come from the kid's own decrypted friend cards.
    try {
      for (const friend of await deps.friends.listFriends(kid, keys, session)) {
        const name = friend.name ?? friend.nickname;
        if (name) senderNames.set(friend.counterpartKidId, name);
      }
    } catch {
      // Names are cosmetic: the collection still renders without them.
    }
  }

  return {
    snapshots: views.map((view) => ({
      view,
      info: decodeSnapshotInfo(view, session, keys),
      senderName: view.senderKidId ? (senderNames.get(view.senderKidId) ?? null) : null,
    })),
    keys: remembered,
  };
}

/** The kid's collection split into the two sections the library renders. */
export function splitSnapshotSections<T extends { view: Pick<SnapshotView, "origin"> }>(
  snapshots: T[],
): { received: T[]; own: T[] } {
  return {
    received: snapshots.filter((s) => s.view.origin === "received"),
    own: snapshots.filter((s) => s.view.origin === "own"),
  };
}

export interface AccountSnapshot {
  view: SnapshotView;
  /** The account kid that owns the row. */
  kidId: string;
  kidName: string;
  /** Null = blob unreadable (wrong keys / tampered): render a fallback row. */
  info: SnapshotInfoV1 | null;
  /** Decrypted friend name for received rows ("From Lea"). */
  senderName: string | null;
  /** Decrypted friend name for own rows created by sharing ("Sent to Lea"). */
  sentToName: string | null;
}

export interface FriendKidOption {
  id: string;
  /** Null when no friend card resolves a name (cosmetic). */
  name: string | null;
}

interface KidCollection {
  rows: AccountSnapshot[];
  /** Friend kids referenced by this kid's rows (sender or sent-to). */
  friends: Map<string, string | null>;
}

/**
 * One kid's full collection (incl. autosave slots) with decrypted info blobs
 * and friend names. Friend keys are only touched when a row actually references
 * a friend: browsing snapshot-only families never generates a friend identity.
 */
async function loadKidCollection(
  deps: SnapshotDeps,
  kid: Kid,
  session: VaultSession,
): Promise<KidCollection> {
  const views = await fetchSnapshots(deps, kid.id, { includeAutosave: true });

  const needsFriends = views.some((v) => v.origin === "received" || v.sharedWithKidId !== null);
  let keys: KidFriendKeys | null = null;
  const names = new Map<string, string | null>();
  if (needsFriends) {
    keys = await deps.friends.ensureFriendKeys(kid, session);
    // Friend names come from the kid's own decrypted friend cards.
    try {
      for (const friend of await deps.friends.listFriends(kid, keys, session)) {
        names.set(friend.counterpartKidId, friend.name ?? friend.nickname);
      }
    } catch {
      // Names are cosmetic: the overview still renders without them.
    }
  }

  const friends = new Map<string, string | null>();
  const noteFriend = (id: string | null): void => {
    if (id) friends.set(id, names.get(id) ?? friends.get(id) ?? null);
  };
  const rows = views.map((view: SnapshotView): AccountSnapshot => {
    noteFriend(view.senderKidId);
    noteFriend(view.sharedWithKidId);
    return {
      view,
      kidId: kid.id,
      kidName: kid.display_name,
      info: decodeSnapshotInfo(view, session, keys),
      senderName: view.senderKidId ? (names.get(view.senderKidId) ?? null) : null,
      sentToName: view.sharedWithKidId ? (names.get(view.sharedWithKidId) ?? null) : null,
    };
  });
  return { rows, friends };
}

/**
 * Every kid's snapshot collection for the parent overview: own + received +
 * the hidden autosave slots, newest first, plus the friend kids the family
 * exchanged snapshots with (for the kid filter's "Other" section). Siblings
 * can be friends too, so own kids are excluded from `friendKids`.
 */
export async function loadAccountSnapshots(
  deps: SnapshotDeps,
  kids: Kid[],
  session: VaultSession,
): Promise<{ snapshots: AccountSnapshot[]; friendKids: FriendKidOption[] }> {
  const collections = await Promise.all(kids.map((kid) => loadKidCollection(deps, kid, session)));

  const snapshots = collections
    .flatMap((c) => c.rows)
    .sort((a, b) => b.view.createdAt.localeCompare(a.view.createdAt));

  // Merge each kid's friend references; any resolved name wins over null.
  const friends = new Map<string, string | null>();
  for (const c of collections) {
    for (const [id, name] of c.friends) {
      friends.set(id, name ?? friends.get(id) ?? null);
    }
  }
  for (const kid of kids) friends.delete(kid.id);

  return {
    snapshots,
    friendKids: [...friends]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
  };
}

// ---------------------------------------------------------------------------
// Capture → seal → save
// ---------------------------------------------------------------------------

/**
 * A snapshot's gallery thumbnail: the capture scaled down into this box as a
 * JPEG (keeps every gallery decrypt cheap). The web's downscale defaults.
 */
export const SNAPSHOT_THUMBNAIL = { maxWidth: 240, maxHeight: 300, quality: 0.7 } as const;

/** E2EE-internal marker title: autosave slots never appear in the collection. */
export const AUTOSAVE_TITLE = "Autosave";

/** What a snapshot of the running game records besides its save state. */
export interface SnapshotGameContext {
  /** The game row the snapshot points back to (null: none, e.g. a received copy). */
  gameId: string | null;
  gameTitle: string;
  gameDescription: string;
  gameMarkdown: string;
  codeBundle: string;
  capabilities: string[];
  drawingStyle: DrawingStyle;
}

/** The plaintext of both blobs (sealed by {@link sealOwnSnapshot}). */
export interface SnapshotContent {
  info: SnapshotInfoV1;
  payload: SnapshotPayloadV1;
}

export function buildSnapshotContent(
  context: SnapshotGameContext,
  title: string,
  savedState: GameSaveState,
  thumbnail: string | null,
  now: Date = new Date(),
): SnapshotContent {
  const createdAt = now.toISOString();
  return {
    info: { v: 1, title, gameTitle: context.gameTitle, thumbnail, createdAt },
    payload: {
      v: 1,
      title,
      createdAt,
      gameId: context.gameId,
      gameTitle: context.gameTitle,
      gameDescription: context.gameDescription,
      gameMarkdown: context.gameMarkdown,
      codeBundle: context.codeBundle,
      capabilities: context.capabilities,
      drawingStyle: context.drawingStyle,
      savedState,
    },
  };
}

/** A manual snapshot's title when none was asked for: "<game> · <date>". */
export function defaultSnapshotTitle(gameTitle: string, now: Date = new Date()): string {
  return `${gameTitle} · ${now.toLocaleDateString()}`;
}

/** Seal both blobs under the account vault (own rows and autosaves). */
export function sealOwnSnapshot(
  session: VaultSession,
  content: SnapshotContent,
): { infoEnc: string; payloadEnc: string; payloadBytes: number } {
  return {
    infoEnc: sealOwnSnapshotInfo(session, content.info),
    payloadEnc: sealOwnSnapshotPayload(session, content.payload),
    payloadBytes: estimateSnapshotPayloadBytes(content.payload),
  };
}

// ---------------------------------------------------------------------------
// Share-target resolution ("share this with Lea")
// ---------------------------------------------------------------------------

export type ShareFriendResolution =
  | {
      kind: "ok";
      friendshipId: string;
      /** Recipient's published KEM key (base64url): seal the envelopes to this. */
      kemPublicKey: string;
      /** Recipient's kid id: recorded on the sender's copy as the sent marker. */
      counterpartKidId: string;
      displayName: string;
      /** The sender kid's own friend keys (signs the envelopes). */
      myKeys: KidFriendKeys;
    }
  | { kind: "unknown" | "ambiguous"; candidates: string[] };

/**
 * Case-insensitively match a spoken/typed friend name against the kid's
 * ACCEPTED friends (display name or private nickname). Non-matches and
 * multi-matches return the candidate list so dodi can ask instead of guessing.
 */
export async function resolveFriendForShare(
  deps: SnapshotDeps,
  kid: Kid,
  session: VaultSession,
  rawName: string,
): Promise<ShareFriendResolution> {
  const myKeys = await deps.friends.ensureFriendKeys(kid, session);
  const accepted = (await deps.friends.listFriends(kid, myKeys, session)).filter(
    (f) => f.status === "accepted",
  );

  const candidates = accepted
    .map((f) => f.name ?? f.nickname)
    .filter((name): name is string => !!name);

  const needle = rawName.trim().toLowerCase();
  if (!needle) return { kind: "unknown", candidates };

  const matches = accepted.filter(
    (f) => f.name?.toLowerCase() === needle || f.nickname?.toLowerCase() === needle,
  );
  if (matches.length === 0) return { kind: "unknown", candidates };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      candidates: matches.map((f) => f.name ?? f.nickname).filter((name): name is string => !!name),
    };
  }

  const match = matches[0];
  if (!match.counterpartKemPublicKey) return { kind: "unknown", candidates };
  return {
    kind: "ok",
    friendshipId: match.friendshipId,
    kemPublicKey: match.counterpartKemPublicKey,
    counterpartKidId: match.counterpartKidId,
    displayName: match.name ?? match.nickname ?? rawName.trim(),
    myKeys,
  };
}
