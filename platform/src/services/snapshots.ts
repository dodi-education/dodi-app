import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Friendship,
  GameSnapshot,
  GameSnapshotInsert,
  Kid,
  SnapshotOrigin,
} from "@dodi/types/database";

type Client = SupabaseClient<Database>;

/**
 * Game snapshots service (service-role; scoping enforced here, like friends).
 * The server only ever handles the two opaque sealed blobs (`info_enc`,
 * `payload_enc`) — it validates WHO may store/read a row, never the content.
 */

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
}

export interface SnapshotDetail extends SnapshotListItem {
  payloadEnc: string;
}

async function getKidRow(supabase: Client, kidId: string): Promise<Kid | null> {
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("id", kidId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Kid | null;
}

async function getSnapshotRow(
  supabase: Client,
  id: string,
): Promise<GameSnapshot | null> {
  const { data, error } = await supabase
    .from("game_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as GameSnapshot | null;
}

/** Published signing keys for the given sender kids (absent entries → null). */
async function senderSignKeyMap(
  supabase: Client,
  kidIds: Array<string | null>,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(kidIds.filter((id): id is string => id !== null))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from("kids")
    .select("id, friend_sign_public_key")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{
    id: string;
    friend_sign_public_key: string | null;
  }>) {
    map.set(r.id, r.friend_sign_public_key);
  }
  return map;
}

function toListItem(
  row: GameSnapshot,
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
  };
}

export interface KidScopeInput {
  accountId: string;
  kidId: string;
}

/** A kid's snapshot collection (own + received), newest first. Light rows only. */
export async function listSnapshots(
  supabase: Client,
  input: KidScopeInput,
): Promise<SnapshotListItem[]> {
  const kid = await getKidRow(supabase, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }
  const { data, error } = await supabase
    .from("game_snapshots")
    .select(
      "id, origin, game_id, info_enc, payload_bytes, viewed_at, created_at, sender_kid_id",
    )
    .eq("kid_id", input.kidId)
    .eq("account_id", input.accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GameSnapshot[];
  const senderKeys = await senderSignKeyMap(
    supabase,
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
  supabase: Client,
  input: SnapshotByIdInput,
): Promise<SnapshotDetail | null> {
  const row = await getSnapshotRow(supabase, input.id);
  if (!row || row.account_id !== input.accountId) return null;
  const senderKeys = await senderSignKeyMap(supabase, [row.sender_kid_id]);
  return { ...toListItem(row, senderKeys), payloadEnc: row.payload_enc };
}

export interface CreateOwnSnapshotInput extends KidScopeInput {
  gameId: string | null;
  infoEnc: string;
  payloadEnc: string;
  payloadBytes: number;
}

/** Store a kid's own snapshot (both blobs sealed under the account VMK). */
export async function createOwnSnapshot(
  supabase: Client,
  input: CreateOwnSnapshotInput,
): Promise<{ id: string; createdAt: string }> {
  const kid = await getKidRow(supabase, input.kidId);
  if (!kid || kid.account_id !== input.accountId) {
    throw new Error("kid_not_found");
  }
  const insert: GameSnapshotInsert = {
    account_id: input.accountId,
    kid_id: input.kidId,
    game_id: input.gameId,
    origin: "own",
    info_enc: input.infoEnc,
    payload_enc: input.payloadEnc,
    payload_bytes: input.payloadBytes,
  };
  const { data, error } = await supabase
    .from("game_snapshots")
    .insert(insert)
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);
  const row = data as { id: string; created_at: string };
  return { id: row.id, createdAt: row.created_at };
}

export interface ShareSnapshotInput {
  senderAccountId: string;
  senderKidId: string;
  friendshipId: string;
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
  supabase: Client,
  input: ShareSnapshotInput,
): Promise<{ id: string; recipientKidId: string }> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", input.friendshipId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const friendship = (data ?? null) as Friendship | null;
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
    // The recipient never had the sender's game row — the payload is self-contained.
    game_id: null,
    origin: "received",
    sender_kid_id: input.senderKidId,
    friendship_id: friendship.id,
    info_enc: input.infoEnc,
    payload_enc: input.payloadEnc,
    payload_bytes: input.payloadBytes,
  };
  const { data: created, error: insertError } = await supabase
    .from("game_snapshots")
    .insert(insert)
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return { id: (created as { id: string }).id, recipientKidId };
}

/** Delete a snapshot the caller's account owns. */
export async function deleteSnapshot(
  supabase: Client,
  input: SnapshotByIdInput,
): Promise<void> {
  const row = await getSnapshotRow(supabase, input.id);
  if (!row || row.account_id !== input.accountId) {
    throw new Error("snapshot_not_found");
  }
  const { error } = await supabase
    .from("game_snapshots")
    .delete()
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

/** Set viewed_at once (idempotent) — drives the "new" badge on received rows. */
export async function markSnapshotViewed(
  supabase: Client,
  input: SnapshotByIdInput,
): Promise<void> {
  const row = await getSnapshotRow(supabase, input.id);
  if (!row || row.account_id !== input.accountId) {
    throw new Error("snapshot_not_found");
  }
  if (row.viewed_at !== null) return;
  const { error } = await supabase
    .from("game_snapshots")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}
