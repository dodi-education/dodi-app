import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Friendship,
  FriendshipInsert,
  FriendshipStatus,
  FriendshipUpdate,
  Kid,
} from "@dodi/types/database";

type Client = SupabaseClient<Database>;

/** Statuses for which a pair counts as having a "live" relationship. */
const LIVE_STATUSES: FriendshipStatus[] = [
  "pending",
  "awaiting_parent",
  "accepted",
  "blocked",
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

interface StatusInputs {
  status: string;
  addressee_accepted: boolean;
  requester_parent_ok: boolean | null;
  addressee_parent_ok: boolean | null;
}

/**
 * The single source of truth for friendship status. `*_parent_ok` is tri-state:
 * null = approval not required for that side, false = required but pending,
 * true = approved. A friendship is `accepted` only once the addressee kid has
 * accepted AND every side that requires a parent's final approval has it.
 */
export function computeStatus(row: StatusInputs): FriendshipStatus {
  if (row.status === "rejected" || row.status === "blocked") {
    return row.status;
  }
  if (!row.addressee_accepted) return "pending";
  const stillPending = (v: boolean | null) => v === false;
  if (stillPending(row.requester_parent_ok) || stillPending(row.addressee_parent_ok)) {
    return "awaiting_parent";
  }
  return "accepted";
}

// ---------------------------------------------------------------------------
// Low-level row helpers
// ---------------------------------------------------------------------------

async function getKidRow(
  supabase: Client,
  kidId: string,
): Promise<Kid | null> {
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("id", kidId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Kid | null;
}

async function getFriendship(
  supabase: Client,
  id: string,
): Promise<Friendship | null> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Friendship | null;
}

async function updateFriendship(
  supabase: Client,
  id: string,
  patch: FriendshipUpdate,
): Promise<Friendship> {
  const { data, error } = await supabase
    .from("friendships")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Friendship;
}

/** Find an existing live relationship between two kids, either direction. */
async function findLivePair(
  supabase: Client,
  kidA: string,
  kidB: string,
): Promise<Friendship | null> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_kid_id.eq.${kidA},addressee_kid_id.eq.${kidA}`);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Friendship[];
  return (
    rows.find(
      (r) =>
        LIVE_STATUSES.includes(r.status as FriendshipStatus) &&
        (r.requester_kid_id === kidB ||
          r.addressee_kid_id === kidB),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Friend identity keys + discovery
// ---------------------------------------------------------------------------

export interface PublishFriendKeysInput {
  accountId: string;
  kidId: string;
  kemPublicKey: string;
  signPublicKey: string;
  sealedSecretKeys: string;
}

/** Publish a kid's friend identity (owner-scoped). */
export async function publishFriendKeys(
  supabase: Client,
  input: PublishFriendKeysInput,
): Promise<void> {
  const { error } = await supabase
    .from("kids")
    .update({
      friend_kem_public_key: input.kemPublicKey,
      friend_sign_public_key: input.signPublicKey,
      friend_secret_keys: input.sealedSecretKeys,
    })
    .eq("id", input.kidId)
    .eq("account_id", input.accountId);
  if (error) throw new Error(error.message);
}

export interface FriendTarget {
  kidId: string;
  kemPublicKey: string;
  signPublicKey: string;
}

/**
 * Resolve a `social_id` to the minimal public data needed to send a request.
 * Returns null unless the target is discoverable (`can_be_added_as_friend`) and
 * has published keys — never leaks names, ciphertext, or a browsable list.
 */
export async function lookupFriendTarget(
  supabase: Client,
  socialId: string,
): Promise<FriendTarget | null> {
  const { data, error } = await supabase
    .from("kids")
    .select(
      "id, can_be_added_as_friend, friend_kem_public_key, friend_sign_public_key",
    )
    .eq("social_id", socialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as {
    id: string;
    can_be_added_as_friend: boolean;
    friend_kem_public_key: string | null;
    friend_sign_public_key: string | null;
  };
  if (
    !row.can_be_added_as_friend ||
    !row.friend_kem_public_key ||
    !row.friend_sign_public_key
  ) {
    return null;
  }
  return {
    kidId: row.id,
    kemPublicKey: row.friend_kem_public_key,
    signPublicKey: row.friend_sign_public_key,
  };
}

// ---------------------------------------------------------------------------
// Mutations (service-role; scoping enforced here)
// ---------------------------------------------------------------------------

export interface CreateFriendRequestInput {
  requesterAccountId: string;
  requesterKidId: string;
  targetKidId: string;
  /** Stringified SealedEnvelope: name + avatar, sealed to the target. */
  previewCard: string;
  /** Stringified SealedEnvelope: full card (adds birthdate), withheld until accepted. */
  fullCard: string;
  /** Requester's private nickname for this friend (enc:v1: under their VMK), shown only to them. */
  nickname: string;
}

export async function createFriendRequest(
  supabase: Client,
  input: CreateFriendRequestInput,
): Promise<Friendship> {
  // Errors are stable codes (not prose): the client maps them to localized,
  // kid-friendly copy — the server is locale-blind and holds no UI strings.
  const requester = await getKidRow(supabase, input.requesterKidId);
  if (!requester || requester.account_id !== input.requesterAccountId) {
    throw new Error("requester_not_found");
  }
  if (!requester.can_add_friends) {
    throw new Error("cannot_initiate");
  }
  if (!requester.friend_kem_public_key) {
    throw new Error("no_friend_keys");
  }

  const target = await getKidRow(supabase, input.targetKidId);
  if (
    !target ||
    !target.can_be_added_as_friend ||
    !target.friend_kem_public_key
  ) {
    throw new Error("target_unavailable");
  }
  if (target.id === requester.id) {
    throw new Error("cannot_add_self");
  }

  const existing = await findLivePair(supabase, requester.id, target.id);
  if (existing) {
    if (existing.status === "blocked") throw new Error("friendship_blocked");
    if (existing.status === "accepted") throw new Error("already_friends");
    throw new Error("request_exists");
  }

  const insert: FriendshipInsert = {
    requester_account_id: requester.account_id,
    requester_kid_id: requester.id,
    addressee_account_id: target.account_id,
    addressee_kid_id: target.id,
    status: "pending",
    addressee_accepted: false,
    // The requester's own parent gates their OUTGOING requests; the addressee's
    // parent gates their INCOMING requests. Each side is independent.
    requester_parent_ok: requester.outgoing_friend_requests_require_parent_approval
      ? false
      : null,
    addressee_parent_ok: target.incoming_friend_requests_require_parent_approval
      ? false
      : null,
    requester_preview_card: input.previewCard,
    requester_card: input.fullCard,
    nickname: input.nickname,
  };

  const { data, error } = await supabase
    .from("friendships")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Friendship;
}

export interface RespondInput {
  accountId: string;
  /** The acting kid's kid — disambiguates siblings on the same account. */
  kidId: string;
  friendshipId: string;
  action: "accept" | "reject";
  /** Stringified SealedEnvelope: the addressee's full card, sealed to the requester. Required to accept. */
  addresseeCard?: string;
}

export async function respondToRequest(
  supabase: Client,
  input: RespondInput,
): Promise<Friendship> {
  const row = await getFriendship(supabase, input.friendshipId);
  if (!row) throw new Error("Friend request not found");
  if (participantSide(row, input.accountId, input.kidId) !== "addressee") {
    throw new Error("Not authorized to respond to this request");
  }
  if (row.status !== "pending") {
    throw new Error(`Cannot respond to a ${row.status} request`);
  }

  if (input.action === "reject") {
    return updateFriendship(supabase, row.id, { status: "rejected" });
  }

  if (!input.addresseeCard) {
    throw new Error("addresseeCard is required to accept");
  }
  const status = computeStatus({
    status: row.status,
    addressee_accepted: true,
    requester_parent_ok: row.requester_parent_ok,
    addressee_parent_ok: row.addressee_parent_ok,
  });
  return updateFriendship(supabase, row.id, {
    addressee_accepted: true,
    addressee_card: input.addresseeCard,
    status,
  });
}

export interface ParentApprovalInput {
  accountId: string;
  friendshipId: string;
  side: "requester" | "addressee";
  approve: boolean;
}

export async function setParentApproval(
  supabase: Client,
  input: ParentApprovalInput,
): Promise<Friendship> {
  const row = await getFriendship(supabase, input.friendshipId);
  if (!row) throw new Error("Friendship not found");

  const sideAccount =
    input.side === "requester"
      ? row.requester_account_id
      : row.addressee_account_id;
  if (sideAccount !== input.accountId) {
    throw new Error("Not authorized to approve this side");
  }
  if (row.status !== "pending" && row.status !== "awaiting_parent") {
    throw new Error(`Cannot approve a ${row.status} friendship`);
  }
  const currentOk =
    input.side === "requester"
      ? row.requester_parent_ok
      : row.addressee_parent_ok;
  if (currentOk === null) {
    throw new Error("This side does not require parent approval");
  }

  if (!input.approve) {
    return updateFriendship(supabase, row.id, { status: "rejected" });
  }

  const requesterOk =
    input.side === "requester" ? true : row.requester_parent_ok;
  const addresseeOk =
    input.side === "addressee" ? true : row.addressee_parent_ok;
  const status = computeStatus({
    status: row.status,
    addressee_accepted: row.addressee_accepted,
    requester_parent_ok: requesterOk,
    addressee_parent_ok: addresseeOk,
  });
  return updateFriendship(supabase, row.id, {
    requester_parent_ok: requesterOk,
    addressee_parent_ok: addresseeOk,
    status,
  });
}

/**
 * The acting kid's side of the row, scoped to its account — or null if this
 * (account, kid) pair isn't a participant. Identifying by kid (not just
 * account) is what distinguishes two kids on the SAME account, which an account
 * id alone cannot: e.g. when sibling A blocks sibling L, the block must be
 * attributed to A's kid, not just "the account's requester side".
 */
function participantSide(
  row: Friendship,
  accountId: string,
  kidId: string,
): "requester" | "addressee" | null {
  if (
    row.requester_account_id === accountId &&
    row.requester_kid_id === kidId
  ) {
    return "requester";
  }
  if (
    row.addressee_account_id === accountId &&
    row.addressee_kid_id === kidId
  ) {
    return "addressee";
  }
  return null;
}

export interface BlockInput {
  accountId: string;
  /** The acting kid's kid — sets blocked_by and disambiguates siblings. */
  kidId: string;
  friendshipId: string;
}

export async function blockFriend(
  supabase: Client,
  input: BlockInput,
): Promise<Friendship> {
  const row = await getFriendship(supabase, input.friendshipId);
  if (!row) throw new Error("Friendship not found");
  if (!participantSide(row, input.accountId, input.kidId)) {
    throw new Error("Not authorized");
  }
  return updateFriendship(supabase, row.id, {
    status: "blocked",
    blocked_by: input.kidId,
  });
}

/** Unblock by removing the row, so reconnecting requires a fresh request. */
export async function unblockFriend(
  supabase: Client,
  input: BlockInput,
): Promise<void> {
  const row = await getFriendship(supabase, input.friendshipId);
  if (!row) throw new Error("Friendship not found");
  if (!participantSide(row, input.accountId, input.kidId)) {
    throw new Error("Not authorized");
  }
  if (row.status !== "blocked") throw new Error("Friendship is not blocked");
  if (row.blocked_by && row.blocked_by !== input.kidId) {
    throw new Error("Only the kid who blocked can unblock");
  }
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

/**
 * Remove a friendship the acting kid participates in — used both to withdraw an
 * outgoing request and to unfriend an accepted friend. Deleting frees the pair
 * so a fresh request can be sent later. Blocked rows must be unblocked instead.
 */
export async function removeFriendship(
  supabase: Client,
  input: BlockInput,
): Promise<void> {
  const row = await getFriendship(supabase, input.friendshipId);
  if (!row) throw new Error("Friendship not found");
  if (!participantSide(row, input.accountId, input.kidId)) {
    throw new Error("Not authorized");
  }
  if (row.status === "blocked") throw new Error("Unblock the friendship instead");
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reads (service-role; sanitized views with card-delivery gating)
// ---------------------------------------------------------------------------

export interface FriendshipView {
  id: string;
  status: FriendshipStatus;
  role: "requester" | "addressee";
  counterpartKidId: string;
  counterpartSocialId: string | null;
  /** Counterpart's published signing key — pass as expectedSenderSignPublicKey when opening the card. */
  counterpartSignPublicKey: string | null;
  /** Counterpart's published KEM key — the viewer seals their reply card to this. */
  counterpartKemPublicKey: string | null;
  /** Sealed card the viewer can decrypt (or null if none is deliverable yet). */
  card: string | null;
  cardKind: "preview" | "full" | null;
  /** Requester's private nickname (enc:v1: under their VMK) — delivered only to the requester. */
  nickname: string | null;
  /** While awaiting_parent: is the VIEWER's own side still waiting on their parent? */
  myParentPending: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CounterpartInfo {
  socialId: string | null;
  signPublicKey: string | null;
  kemPublicKey: string | null;
}

async function counterpartInfoMap(
  supabase: Client,
  kidIds: string[],
): Promise<Map<string, CounterpartInfo>> {
  const map = new Map<string, CounterpartInfo>();
  const unique = [...new Set(kidIds)];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from("kids")
    .select("id, social_id, friend_sign_public_key, friend_kem_public_key")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{
    id: string;
    social_id: string;
    friend_sign_public_key: string | null;
    friend_kem_public_key: string | null;
  }>) {
    map.set(r.id, {
      socialId: r.social_id,
      signPublicKey: r.friend_sign_public_key,
      kemPublicKey: r.friend_kem_public_key,
    });
  }
  return map;
}

/** Build a viewer-scoped, card-gated view of a friendship row. */
function toView(
  row: Friendship,
  viewerKidId: string,
  counterparts: Map<string, CounterpartInfo>,
): FriendshipView {
  const role: "requester" | "addressee" =
    row.requester_kid_id === viewerKidId ? "requester" : "addressee";
  const counterpartKidId =
    role === "requester" ? row.addressee_kid_id : row.requester_kid_id;
  const status = row.status as FriendshipStatus;

  // The full card (with birthdate) is delivered once the friendship is live
  // (accepted) or blocked — the kid already knows who they're blocking. Before
  // acceptance the addressee sees only the requester's preview (name + avatar).
  const settled = status === "accepted" || status === "blocked";
  let card: string | null = null;
  let cardKind: "preview" | "full" | null = null;
  if (role === "addressee") {
    if (settled) {
      card = row.requester_card ?? row.requester_preview_card;
      cardKind = row.requester_card ? "full" : card ? "preview" : null;
    } else if (status === "pending" || status === "awaiting_parent") {
      card = row.requester_preview_card;
      cardKind = card ? "preview" : null;
    }
  } else {
    // The requester only learns the addressee's identity once they accept.
    if (settled) {
      card = row.addressee_card;
      cardKind = card ? "full" : null;
    }
  }

  const info = counterparts.get(counterpartKidId);
  // Is the viewer's own side still waiting on its parent? (false = either approved
  // or not required; the other side being pending makes it "friend's parent".)
  const myParentPending =
    role === "requester"
      ? row.requester_parent_ok === false
      : row.addressee_parent_ok === false;
  return {
    id: row.id,
    status,
    role,
    counterpartKidId,
    counterpartSocialId: info?.socialId ?? null,
    counterpartSignPublicKey: info?.signPublicKey ?? null,
    counterpartKemPublicKey: info?.kemPublicKey ?? null,
    card,
    cardKind,
    // The nickname is the requester's own — never expose it to the addressee.
    nickname: role === "requester" ? row.nickname : null,
    myParentPending,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildViews(
  supabase: Client,
  rows: Friendship[],
  viewerKidId: string,
): Promise<FriendshipView[]> {
  const counterpartIds = rows.map((r) =>
    r.requester_kid_id === viewerKidId
      ? r.addressee_kid_id
      : r.requester_kid_id,
  );
  const counterparts = await counterpartInfoMap(supabase, counterpartIds);
  return rows.map((r) => toView(r, viewerKidId, counterparts));
}

async function rowsForKid(
  supabase: Client,
  accountId: string,
  kidId: string,
): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(
      `requester_kid_id.eq.${kidId},addressee_kid_id.eq.${kidId}`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Defense-in-depth: ensure the caller's account actually owns this kid's side.
  return ((data ?? []) as Friendship[]).filter(
    (r) =>
      (r.requester_kid_id === kidId &&
        r.requester_account_id === accountId) ||
      (r.addressee_kid_id === kidId &&
        r.addressee_account_id === accountId),
  );
}

export interface KidScopeInput {
  accountId: string;
  kidId: string;
}

/** Accepted friends of a given kid. */
export async function listFriends(
  supabase: Client,
  input: KidScopeInput,
): Promise<FriendshipView[]> {
  const rows = (await rowsForKid(supabase, input.accountId, input.kidId)).filter(
    (r) => r.status === "accepted",
  );
  return buildViews(supabase, rows, input.kidId);
}

export interface ListRequestsInput extends KidScopeInput {
  direction: "incoming" | "outgoing";
}

/**
 * In-progress friendships for a kid that aren't active yet:
 * `incoming` = received by this kid (pending → needs their accept/reject; or
 * awaiting_parent → they accepted, now waiting on a parent); `outgoing` = sent
 * by this kid and not yet live. `awaiting_parent` must stay visible on both
 * sides, otherwise an accepted-but-unapproved request disappears for the kid.
 */
export async function listRequests(
  supabase: Client,
  input: ListRequestsInput,
): Promise<FriendshipView[]> {
  const all = await rowsForKid(supabase, input.accountId, input.kidId);
  const rows = all.filter((r) => {
    const inProgress = r.status === "pending" || r.status === "awaiting_parent";
    if (!inProgress) return false;
    return input.direction === "incoming"
      ? r.addressee_kid_id === input.kidId
      : r.requester_kid_id === input.kidId;
  });
  return buildViews(supabase, rows, input.kidId);
}

/** Friendships this kid has blocked (only the blocker sees them, so they can unblock). */
export async function listBlocked(
  supabase: Client,
  input: KidScopeInput,
): Promise<FriendshipView[]> {
  const rows = (
    await rowsForKid(supabase, input.accountId, input.kidId)
  ).filter((r) => r.status === "blocked" && r.blocked_by === input.kidId);
  return buildViews(supabase, rows, input.kidId);
}

export interface PendingApproval {
  friendshipId: string;
  side: "requester" | "addressee";
  /** The account's own kid on the side awaiting approval. */
  kidId: string;
  counterpartKidId: string;
  counterpartSocialId: string | null;
  /** Counterpart's published signing key — verifies the incoming preview card. */
  counterpartSignPublicKey: string | null;
  /** Requester's private nickname (enc under this parent's VMK). Set for outgoing (requester-side) only. */
  nickname: string | null;
  /** Requester's sealed preview card. Set for incoming (addressee-side) only; the parent opens it with the kid's keys. */
  previewCard: string | null;
  createdAt: string;
}

/**
 * Friendships across all of a parent account's kids that are waiting on this
 * parent's final approval.
 */
export async function listPendingApprovals(
  supabase: Client,
  accountId: string,
): Promise<PendingApproval[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "awaiting_parent")
    .or(
      `requester_account_id.eq.${accountId},addressee_account_id.eq.${accountId}`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Friendship[];

  type PartialApproval = Omit<
    PendingApproval,
    "counterpartSocialId" | "counterpartSignPublicKey"
  >;
  const approvals: PartialApproval[] = [];
  for (const r of rows) {
    if (r.requester_account_id === accountId && r.requester_parent_ok === false) {
      // Outgoing: this parent's child is the requester. The nickname they typed
      // is sealed under this account's VMK, so the parent can read it.
      approvals.push({
        friendshipId: r.id,
        side: "requester",
        kidId: r.requester_kid_id,
        counterpartKidId: r.addressee_kid_id,
        nickname: r.nickname,
        previewCard: null,
        createdAt: r.created_at,
      });
    }
    if (r.addressee_account_id === accountId && r.addressee_parent_ok === false) {
      // Incoming: the preview card was sealed to this parent's child; the parent
      // opens it with the child's friend keys (also under this account's VMK).
      approvals.push({
        friendshipId: r.id,
        side: "addressee",
        kidId: r.addressee_kid_id,
        counterpartKidId: r.requester_kid_id,
        nickname: null,
        previewCard: r.requester_preview_card,
        createdAt: r.created_at,
      });
    }
  }
  const counterparts = await counterpartInfoMap(
    supabase,
    approvals.map((a) => a.counterpartKidId),
  );
  return approvals.map((a) => ({
    ...a,
    counterpartSocialId: counterparts.get(a.counterpartKidId)?.socialId ?? null,
    counterpartSignPublicKey:
      counterparts.get(a.counterpartKidId)?.signPublicKey ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Card refresh — keep friends' view of shared data (name/avatar/birthdate) live
// ---------------------------------------------------------------------------

export interface CardRefreshTarget {
  friendshipId: string;
  side: "requester" | "addressee";
  /** Counterpart's published KEM key — the owner re-seals their card to this. */
  counterpartKemPublicKey: string | null;
}

/**
 * Friendships whose stored card was sealed BY this kid and should be
 * re-sealed when its shared data changes, so the counterpart's list stays
 * current. Requester side: name+avatar travel from the start (preview), so every
 * non-rejected row qualifies. Addressee side: a card only exists once the kid
 * has accepted. Scoped to the caller's account via `rowsForKid`.
 */
export async function listCardRefreshTargets(
  supabase: Client,
  input: KidScopeInput,
): Promise<CardRefreshTarget[]> {
  const rows = await rowsForKid(supabase, input.accountId, input.kidId);
  const relevant = rows.filter((r) => {
    if (r.status === "rejected") return false;
    const isRequester = r.requester_kid_id === input.kidId;
    return isRequester || r.addressee_accepted;
  });
  const counterpartIds = relevant.map((r) =>
    r.requester_kid_id === input.kidId
      ? r.addressee_kid_id
      : r.requester_kid_id,
  );
  const counterparts = await counterpartInfoMap(supabase, counterpartIds);
  return relevant.map((r) => {
    const side: "requester" | "addressee" =
      r.requester_kid_id === input.kidId ? "requester" : "addressee";
    const counterpartId =
      side === "requester" ? r.addressee_kid_id : r.requester_kid_id;
    return {
      friendshipId: r.id,
      side,
      counterpartKemPublicKey:
        counterparts.get(counterpartId)?.kemPublicKey ?? null,
    };
  });
}

export interface RefreshCardsInput {
  accountId: string;
  kidId: string;
  cards: Array<{
    friendshipId: string;
    /** Re-sealed preview card (name + avatar). Requester side only. */
    previewCard?: string;
    /** Re-sealed full card (adds birthdate). */
    card?: string;
  }>;
}

/**
 * Overwrite this kid's already-sealed cards with freshly-sealed ones. Only
 * the side the acting (account, kid) owns is writable, and the addressee
 * card is only updated once the kid has accepted. Rows the caller doesn't
 * participate in are skipped (defense-in-depth on top of the target lookup).
 * Returns the number of friendships actually updated.
 */
export async function refreshFriendCards(
  supabase: Client,
  input: RefreshCardsInput,
): Promise<number> {
  let updated = 0;
  for (const c of input.cards) {
    const row = await getFriendship(supabase, c.friendshipId);
    if (!row) continue;
    const side = participantSide(row, input.accountId, input.kidId);
    if (!side) continue;
    const patch: FriendshipUpdate = {};
    if (side === "requester") {
      if (c.previewCard) patch.requester_preview_card = c.previewCard;
      if (c.card) patch.requester_card = c.card;
    } else if (row.addressee_accepted && c.card) {
      patch.addressee_card = c.card;
    }
    if (Object.keys(patch).length > 0) {
      await updateFriendship(supabase, row.id, patch);
      updated++;
    }
  }
  return updated;
}
