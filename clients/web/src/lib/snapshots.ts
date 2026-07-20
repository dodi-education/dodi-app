/**
 * Client-side snapshots API + E2EE decode helpers (mirrors `friends.ts`).
 *
 * A snapshot row carries two opaque sealed blobs: the light `info` (title,
 * game title, thumbnail — decrypted to render the collection) and the heavy
 * `payload` (game code + metadata + restorable save state — fetched on open).
 * Own rows are sealed under the account VMK; received rows are SealedEnvelope
 * JSON sealed to this kid's friend KEM key and signed by the sender kid, whose
 * published signing key the server delivers alongside for verification.
 */
import { dodi } from "@/lib/api";
import { decodeView, ensureFriendKeys, fetchFriends } from "@/lib/friends";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import {
  openOwnSnapshotInfo,
  openOwnSnapshotPayload,
  openSharedSnapshotInfo,
  openSharedSnapshotPayload,
  type KidFriendKeys,
} from "@dodi/protocol";
import type { Kid, SnapshotOrigin } from "@dodi/types/database";
import type { SnapshotInfoV1, SnapshotPayloadV1 } from "@dodi/types/games";
import type { VaultSession } from "@dodi/vault";

export interface SnapshotView {
  id: string;
  origin: SnapshotOrigin;
  gameId: string | null;
  infoEnc: string;
  payloadBytes: number;
  viewedAt: string | null;
  createdAt: string;
  senderKidId: string | null;
  /** Sender kid's published signing key — verifies the sealed blobs. */
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

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dodi.request(path, {
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

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function fetchSnapshots(
  kidId: string,
  opts?: { includeAutosave?: boolean },
): Promise<SnapshotView[]> {
  const params = new URLSearchParams({ kidId });
  if (opts?.includeAutosave) params.set("includeAutosave", "1");
  return jsonRequest<SnapshotView[]>(`/api/snapshots?${params.toString()}`);
}

export function fetchSnapshot(id: string): Promise<SnapshotDetailView> {
  return jsonRequest<SnapshotDetailView>(
    `/api/snapshots/${encodeURIComponent(id)}`,
  );
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
  input: CreateOwnSnapshotInput,
): Promise<{ id: string; createdAt: string }> {
  return jsonRequest("/api/snapshots", {
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
  input: ShareSnapshotInput,
): Promise<{ id: string }> {
  return jsonRequest("/api/snapshots/share", {
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

/** Overwrite (or create) the kid's single autosave slot for a game. */
export function upsertAutosaveSnapshot(
  input: UpsertAutosaveInput,
): Promise<{ id: string }> {
  return jsonRequest("/api/snapshots/autosave", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** The kid's autosave slot for a game, or null when none exists yet. */
export async function fetchAutosaveSnapshot(
  kidId: string,
  gameId: string,
): Promise<SnapshotDetailView | null> {
  try {
    return await jsonRequest<SnapshotDetailView>(
      `/api/snapshots/autosave?kidId=${encodeURIComponent(kidId)}&gameId=${encodeURIComponent(gameId)}`,
    );
  } catch (error) {
    if (error instanceof SnapshotsError && error.status === 404) return null;
    throw error;
  }
}

export function deleteSnapshot(id: string): Promise<{ ok: boolean }> {
  return jsonRequest(`/api/snapshots/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function markSnapshotViewed(id: string): Promise<{ ok: boolean }> {
  return jsonRequest(`/api/snapshots/${encodeURIComponent(id)}`, {
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
 * the blob can't be opened (wrong keys / tampered) — the gallery renders a
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
  /** Re-sanitized game code — the ONLY code that may reach the sandbox. */
  sanitizedCode: string;
}

/**
 * Decrypt + validate a snapshot's full payload and re-sanitize the embedded
 * game code (defense in depth — a received payload originates from another
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

// ---------------------------------------------------------------------------
// Share-target resolution ("share this with Lea")
// ---------------------------------------------------------------------------

export type ShareFriendResolution =
  | {
      kind: "ok";
      friendshipId: string;
      /** Recipient's published KEM key (base64url) — seal the envelopes to this. */
      kemPublicKey: string;
      /** Recipient's kid id — recorded on the sender's copy as the sent marker. */
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
  kid: Kid,
  session: VaultSession,
  rawName: string,
): Promise<ShareFriendResolution> {
  const myKeys = await ensureFriendKeys(kid, session);
  const views = await fetchFriends(kid.id);
  const accepted = views
    .filter((v) => v.status === "accepted")
    .map((view) => ({ view, decoded: decodeView(view, myKeys, session) }));

  const candidates = accepted
    .map(({ decoded }) => decoded.name ?? decoded.nickname)
    .filter((name): name is string => !!name);

  const needle = rawName.trim().toLowerCase();
  if (!needle) return { kind: "unknown", candidates };

  const matches = accepted.filter(
    ({ decoded }) =>
      decoded.name?.toLowerCase() === needle ||
      decoded.nickname?.toLowerCase() === needle,
  );
  if (matches.length === 0) return { kind: "unknown", candidates };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      candidates: matches
        .map(({ decoded }) => decoded.name ?? decoded.nickname)
        .filter((name): name is string => !!name),
    };
  }

  const { view, decoded } = matches[0];
  if (!view.counterpartKemPublicKey) return { kind: "unknown", candidates };
  return {
    kind: "ok",
    friendshipId: decoded.id,
    kemPublicKey: view.counterpartKemPublicKey,
    counterpartKidId: view.counterpartKidId,
    displayName: decoded.name ?? decoded.nickname ?? rawName.trim(),
    myKeys,
  };
}
