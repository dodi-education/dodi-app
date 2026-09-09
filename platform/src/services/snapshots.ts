import type { Selectable } from "kysely";

import type {
  Database,
  GameSnapshot,
  GameSnapshotInsert,
  SnapshotOrigin,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";

/**
 * Game snapshots service (service-role; scoping enforced here, like friends).
 * The server only ever handles the two opaque sealed blobs (`info_enc`,
 * `payload_enc`) — it validates WHO may store/read a row, never the content.
 */

/** Raw kids row (the API `Kid` shape swaps the persona FK for an embed). */
type KidRow = Selectable<Database["kids"]>;

export interface SnapshotListItem {
  id: string;
  origin: SnapshotOrigin;
  gameId: string | null;
  infoEnc: string;
  payloadBytes: number;
  viewedAt: string | null;
  createdAt: string;
  senderKidId: string | null;
  /** Sender kid's published signing key — pass when opening the sealed blobs. */
  senderSignPublicKey: string | null;
  /** On own rows created by sharing: the friend kid the copy was sent to. */
  sharedWithKidId: string | null;
}

export interface SnapshotDetail extends SnapshotListItem {
  payloadEnc: string;
}

async function getKidRow(db: Db, kidId: string): Promise<KidRow | null> {
  const row = await db
    .selectFrom("kids")
    .selectAll()
    .where("id", "=", kidId)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * True when an insert failed the FK on `constraint`: the snapshot references
 * a row that no longer exists (e.g. re-sharing/re-saving an old snapshot after
 * the source game was deleted). Callers retry with a NULL soft reference —
 * the payload is self-contained, so losing a pointer must never lose the save.
 */
function isMissingReference(error: unknown, constraint: string): boolean {
  return isForeignKeyViolation(error, constraint);
}

const GAME_FK = "game_snapshots_game_id_fkey";
const SHARED_WITH_KID_FK = "game_snapshots_shared_with_kid_id_fkey";

async function getSnapshotRow(db: Db, id: string): Promise<GameSnapshot | null> {
  const row = await db
    .selectFrom("game_snapshots")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

/** Published signing keys for the given sender kids (absent entries → null). */
async function senderSignKeyMap(
  db: Db,
  kidIds: Array<string | null>,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(kidIds.filter((id): id is string => id !== null))];
  if (unique.length === 0) return map;
  const rows = await db
    .selectFrom("kids")
    .select(["id", "friend_sign_public_key"])
    .where("id", "in", unique)
    .execute();
  for (const r of rows) {
    map.set(r.id, r.friend_sign_public_key);
  }
  return map;
}

/** The light (list) columns: everything but the heavy payload blob. */
type SnapshotLightRow = Pick<
  GameSnapshot,
  | "id"
  | "origin"
  | "game_id"
  | "info_enc"
  | "payload_bytes"
  | "viewed_at"
  | "created_at"
  | "sender_kid_id"
  | "shared_with_kid_id"
>;

function toListItem(
  row: SnapshotLightRow,
  senderKeys: Map<string, string | null>,
): SnapshotListItem {
  return {
    id: row.id,
    origin: row.origin,
    gameId: row.game_id,
    infoEnc: row.info_enc,
    payloadBytes: row.payload_bytes,
    viewedAt: row.viewed_at,
    createdAt: row.created_at,
    senderKidId: row.sender_kid_id,
    senderSignPublicKey: row.sender_kid_id
      ? (senderKeys.get(row.sender_kid_id) ?? null)
      : null,
    sharedWithKidId: row.shared_with_kid_id,
  };
}

export interface KidScopeInput {
  accountId: string;
  kidId: string;
}

export interface ListSnapshotsInput extends KidScopeInput {
  /** Also return the hidden per-game autosave slots (parent overview). */
  includeAutosave?: boolean;
}

/**
 * A kid's snapshot collection (own + received), newest first. Light rows only.
 * Autosave rows are the per-game resume slot, not part of the collection —
 * they surface only when `includeAutosave` is set (parent overview).
 */
export async function listSnapshots(
  db: Db,
  input: ListSnapshotsInput,
): Promise<SnapshotListItem[]> {
  const kid = await getKidRow(db, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }
  let query = db
    .selectFrom("game_snapshots")
    .select([
      "id",
      "origin",
      "game_id",
      "info_enc",
      "payload_bytes",
      "viewed_at",
      "created_at",
      "sender_kid_id",
      "shared_with_kid_id",
    ])
    .where("kid_id", "=", input.kidId)
    .where("account_id", "=", input.accountId);
  if (!input.includeAutosave) query = query.where("origin", "!=", "autosave");
  const rows = await query.orderBy("created_at", "desc").execute();
  const senderKeys = await senderSignKeyMap(
    db,
    rows.map((r) => r.sender_kid_id),
  );
  return rows.map((r) => toListItem(r, senderKeys));
}

export interface SnapshotByIdInput {
  accountId: string;
  id: string;
}

/** Full snapshot row (incl. the heavy payload blob), owner-scoped. */
export async function getSnapshot(
  db: Db,
  input: SnapshotByIdInput,
): Promise<SnapshotDetail | null> {
  const row = await getSnapshotRow(db, input.id);
  if (!row || row.account_id !== input.accountId) return null;
  const senderKeys = await senderSignKeyMap(db, [row.sender_kid_id]);
  return { ...toListItem(row, senderKeys), payloadEnc: row.payload_enc };
}

export interface CreateOwnSnapshotInput extends KidScopeInput {
  gameId: string | null;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
  /** The friend kid this copy was sent to when created by sharing. */
  sharedWithKidId?: string | null;
}

/** Store a kid's own snapshot (both blobs sealed under the account VMK). */
export async function createOwnSnapshot(
  db: Db,
  input: CreateOwnSnapshotInput,
): Promise<{ id: string; createdAt: string }> {
  const kid = await getKidRow(db, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }
  let insert: GameSnapshotInsert = {
    account_id: input.accountId,
    kid_id: input.kidId,
    game_id: input.gameId,
    origin: "own",
    shared_with_kid_id: input.sharedWithKidId ?? null,
    info_enc: input.infoEnc,
    payload_enc: input.payloadEnc,
    payload_bytes: input.payloadBytes,
  };
  const tryInsert = (row: GameSnapshotInsert) =>
    db
      .insertInto("game_snapshots")
      .values(row)
      .returning(["id", "created_at"])
      .executeTakeFirstOrThrow();

  // Each retry drops one dangling pointer and re-issues the insert (game
  // first, then the sent-to marker); every pointer is nulled at most once.
  for (;;) {
    try {
      const row = await tryInsert(insert);
      return { id: row.id, createdAt: row.created_at };
    } catch (error) {
      if (isMissingReference(error, GAME_FK) && insert.game_id !== null) {
        insert = { ...insert, game_id: null };
        continue;
      }
      if (
        isMissingReference(error, SHARED_WITH_KID_FK) &&
        insert.shared_with_kid_id != null
      ) {
        insert = { ...insert, shared_with_kid_id: null };
        continue;
      }
      throw error;
    }
  }
}

export interface UpsertAutosaveSnapshotInput extends KidScopeInput {
  gameId: string;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
}

/**
 * Write a kid's autosave slot for a game: exactly one `origin='autosave'` row
 * per (kid, game), overwritten in place on every save. A partial unique index
 * backstops the read-then-write against concurrent saves — the losing insert
 * retries as an update.
 */
export async function upsertAutosaveSnapshot(
  db: Db,
  input: UpsertAutosaveSnapshotInput,
): Promise<{ id: string }> {
  const kid = await getKidRow(db, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }

  const patch = {
    info_enc: input.infoEnc,
    payload_enc: input.payloadEnc,
    payload_bytes: input.payloadBytes,
  };

  const updateExisting = async (): Promise<string | null> => {
    const rows = await db
      .updateTable("game_snapshots")
      .set(patch)
      .where("kid_id", "=", input.kidId)
      .where("game_id", "=", input.gameId)
      .where("origin", "=", "autosave")
      .returning("id")
      .execute();
    return rows[0]?.id ?? null;
  };

  const existingId = await updateExisting();
  if (existingId) return { id: existingId };

  const insert: GameSnapshotInsert = {
    account_id: input.accountId,
    kid_id: input.kidId,
    game_id: input.gameId,
    origin: "autosave",
    ...patch,
  };
  try {
    const created = await db
      .insertInto("game_snapshots")
      .values(insert)
      .returning("id")
      .executeTakeFirstOrThrow();
    return { id: created.id };
  } catch (error) {
    // Unique-violation race: another save inserted the slot first — update it.
    if (isUniqueViolation(error)) {
      const racedId = await updateExisting();
      if (racedId) return { id: racedId };
    }
    throw error;
  }
}

export interface AutosaveScopeInput extends KidScopeInput {
  gameId: string;
}

/** The kid's autosave slot for a game (incl. the payload blob), or null. */
export async function getAutosaveSnapshot(
  db: Db,
  input: AutosaveScopeInput,
): Promise<SnapshotDetail | null> {
  const kid = await getKidRow(db, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }
  const row = await db
    .selectFrom("game_snapshots")
    .selectAll()
    .where("kid_id", "=", input.kidId)
    .where("game_id", "=", input.gameId)
    .where("origin", "=", "autosave")
    .executeTakeFirst();
  if (!row) return null;
  return { ...toListItem(row, new Map()), payloadEnc: row.payload_enc };
}

export interface ShareSnapshotInput {
  senderAccountId: string;
  senderKidId: string;
  friendshipId: string;
  /** The sender's source game (soft reference; null when re-sharing an orphaned snapshot). */
  gameId: string | null;
  /** SealedEnvelope JSON strings, sealed to the RECIPIENT kid's friend KEM key. */
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
}

/**
 * Deliver a snapshot to a friend: validates that the sender (account, kid)
 * is a participant of an ACCEPTED friendship, then inserts a `received` row
 * owned by the OTHER side's kid/account. This is the only path that writes
 * received rows (RLS has no user INSERT policy for them).
 *
 * Errors are stable codes (not prose): the client maps them to localized copy
 * and feeds them back to dodi's tool response.
 */
export async function shareSnapshot(
  db: Db,
  input: ShareSnapshotInput,
): Promise<{ id: string; recipientKidId: string }> {
  const friendship = await db
    .selectFrom("friendships")
    .selectAll()
    .where("id", "=", input.friendshipId)
    .executeTakeFirst();
  if (!friendship) throw new Error("friendship_not_found");
  if (friendship.status !== "accepted") throw new Error("friendship_not_accepted");

  let recipientKidId: string;
  let recipientAccountId: string;
  if (
    friendship.requester_kid_id === input.senderKidId &&
    friendship.requester_account_id === input.senderAccountId
  ) {
    recipientKidId = friendship.addressee_kid_id;
    recipientAccountId = friendship.addressee_account_id;
  } else if (
    friendship.addressee_kid_id === input.senderKidId &&
    friendship.addressee_account_id === input.senderAccountId
  ) {
    recipientKidId = friendship.requester_kid_id;
    recipientAccountId = friendship.requester_account_id;
  } else {
    throw new Error("not_participant");
  }

  const insert: GameSnapshotInsert = {
    account_id: recipientAccountId,
    kid_id: recipientKidId,
    // Soft reference to the SENDER's game row (the payload stays self-contained);
    // the FK sets it NULL if the sender ever deletes the game.
    game_id: input.gameId,
    origin: "received",
    sender_kid_id: input.senderKidId,
    friendship_id: friendship.id,
    info_enc: input.infoEnc,
    payload_enc: input.payloadEnc,
    payload_bytes: input.payloadBytes,
  };
  const tryInsert = (row: GameSnapshotInsert) =>
    db
      .insertInto("game_snapshots")
      .values(row)
      .returning("id")
      .executeTakeFirstOrThrow();

  let created: { id: string };
  try {
    created = await tryInsert(insert);
  } catch (error) {
    if (!(isMissingReference(error, GAME_FK) && insert.game_id !== null)) {
      throw error;
    }
    created = await tryInsert({ ...insert, game_id: null });
  }
  return { id: created.id, recipientKidId };
}

/** Delete a snapshot the caller's account owns. */
export async function deleteSnapshot(
  db: Db,
  input: SnapshotByIdInput,
): Promise<void> {
  const row = await getSnapshotRow(db, input.id);
  if (!row || row.account_id !== input.accountId) {
    throw new Error("snapshot_not_found");
  }
  await db.deleteFrom("game_snapshots").where("id", "=", row.id).execute();
}

/** Set viewed_at once (idempotent) — drives the "new" badge on received rows. */
export async function markSnapshotViewed(
  db: Db,
  input: SnapshotByIdInput,
): Promise<void> {
  const row = await getSnapshotRow(db, input.id);
  if (!row || row.account_id !== input.accountId) {
    throw new Error("snapshot_not_found");
  }
  if (row.viewed_at !== null) return;
  await db
    .updateTable("game_snapshots")
    .set({ viewed_at: new Date().toISOString() })
    .where("id", "=", row.id)
    .execute();
}
