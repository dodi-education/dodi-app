/**
 * Publication of a parent-created game to dodi Discover.
 *
 * A private game is end-to-end encrypted and stays that way forever. Requesting
 * publication FORKS it: the browser decrypts the content, posts it here, and we
 * insert a SECOND `games` row that is plaintext by design — publishing is a
 * voluntary disclosure, and the review pass has to be able to read the
 * submission before it goes public. The source row is never touched.
 *
 *   games
 *    ├─ P  private, enc:v1:                  (parent keeps editing)
 *    │    └─ game_versions (enc:v1:)
 *    └─ Q  plaintext copy, source_game_id = P
 *           publication_requested_at → in review
 *           published_at + approved_by → live
 *
 * The copy carries no version history (a publication is a snapshot, not a
 * chain), no `kid_id`, and explicitly NOT `agent_transcript_enc` — the studio
 * conversation is the parent's, and is not part of what they chose to publish.
 *
 * Every write here uses the service-role client: RLS deliberately forbids users
 * from inserting or updating rows with `publication_requested_at` set, so a
 * parent cannot edit a submission out from under review via PostgREST. Each
 * query is therefore scoped to the caller's account in code, the same contract
 * as the friends and snapshot-sharing services.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PublicationRejectionReason,
  RejectionKind,
} from "@dodi/protocol";
import type { Database, Game, GameInsert, Json } from "@dodi/types/database";
import { sanitizeGameBundle } from "../game-sanitizer";

import { filterToCatalogTags } from "./games";

type Client = SupabaseClient<Database>;

/** The decrypted content the client submits. Mirrors `GamePublicationContent`. */
export interface PublicationContent {
  title: string;
  description: string;
  codeBundle: string;
  markdown: string;
  learningGoal: string;
  successDefinition: string;
  successCriteria: Json;
  previewImage: string | null;
}

export class PublicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PublicationError";
  }
}

function castGame(row: unknown): Game {
  return row as Game;
}

/** Start of the current UTC calendar month — the quota window boundary. */
function monthStartUtcIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** The publication copy of a source game, or null when it was never submitted. */
export async function getPublication(
  supabase: Client,
  sourceGameId: string,
  accountId: string,
): Promise<Game | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("source_game_id", sourceGameId)
    .eq("account_id", accountId)
    .not("publication_requested_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data ? castGame(data) : null;
}

/**
 * Submit (or re-submit) a game for review. Re-submitting replaces the copy's
 * content and clears the approval, so an update always goes through review
 * again — the published artifact is never edited in place.
 */
export async function submitPublication(
  supabase: Client,
  input: {
    sourceGameId: string;
    accountId: string;
    content: PublicationContent;
  },
): Promise<Game> {
  const { sourceGameId, accountId, content } = input;

  const { data: sourceRow, error: sourceError } = await supabase
    .from("games")
    .select("*")
    .eq("id", sourceGameId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  const source = sourceRow ? castGame(sourceRow) : null;

  if (!source || source.account_id !== accountId || source.is_system) {
    throw new PublicationError("Game not found", 404);
  }
  if (source.publication_requested_at) {
    throw new PublicationError(
      "This game is already a publication copy",
      400,
    );
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("publication_handle, monthly_game_publication_limit")
    .eq("id", accountId)
    .single();
  if (accountError) throw accountError;
  if (!account.publication_handle) {
    throw new PublicationError(
      "Choose a publication handle before publishing",
      409,
    );
  }

  // A hard rejection is permanent for this source game. The check reads the
  // request log, not the copy row — withdraw deletes the copy, and deleting
  // must not lift the block.
  const { count: hardCount, error: hardError } = await supabase
    .from("game_publication_requests")
    .select("id", { count: "exact", head: true })
    .eq("source_game_id", sourceGameId)
    .eq("rejection_kind", "hard");
  if (hardError) throw hardError;
  if ((hardCount ?? 0) > 0) {
    throw new PublicationError("publication_hard_rejected", 403);
  }

  // Monthly quota: EVERY submit counts (each one triggers a paid AI review),
  // including resubmits after a soft rejection. Count-then-insert can overrun
  // by one under concurrent submits; accepted — the worst case is one extra
  // review, not worth a DB function.
  const { count: usedCount, error: usedError } = await supabase
    .from("game_publication_requests")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gte("requested_at", monthStartUtcIso());
  if (usedError) throw usedError;
  if ((usedCount ?? 0) >= account.monthly_game_publication_limit) {
    throw new PublicationError("publication_limit_reached", 403);
  }

  // The one place the server CAN check the bundle, because this copy is
  // plaintext: real defence-in-depth for code that other families will run.
  const code = sanitizeGameBundle(content.codeBundle).code;

  const payload: GameInsert = {
    account_id: accountId,
    published_by_account_id: accountId,
    source_game_id: sourceGameId,
    kid_id: null,
    is_system: false,
    // A catalog listing is not a library entry; it is played from Discover.
    is_active: false,
    current_game_version_id: null,
    // Deliberately NOT copied: agent_transcript_enc (the parent's studio chat).
    title: content.title,
    description: content.description,
    code_bundle: code,
    markdown: content.markdown,
    learning_goal: content.learningGoal,
    success_definition: content.successDefinition,
    success_criteria: content.successCriteria,
    preview_image: content.previewImage,
    // Plaintext facets carry over verbatim from the source row.
    tags: filterToCatalogTags(source.tags),
    target_age_min: source.target_age_min,
    target_age_max: source.target_age_max,
    estimated_duration_minutes: source.estimated_duration_minutes,
    progress_kind: source.progress_kind,
    metadata: source.metadata,
    created_by: source.created_by,
    publication_requested_at: new Date().toISOString(),
    published_at: null,
    approved_by: null,
    // A resubmit re-enters the review queue clean.
    rejected_at: null,
    rejection_kind: null,
    rejection_reasons: null,
    review_attempts: 0,
  };

  const existing = await getPublication(supabase, sourceGameId, accountId);
  const query = existing
    ? supabase.from("games").update(payload).eq("id", existing.id)
    : supabase.from("games").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  const publication = castGame(data);

  const { error: logError } = await supabase
    .from("game_publication_requests")
    .insert({
      account_id: accountId,
      source_game_id: sourceGameId,
      publication_game_id: publication.id,
    });
  if (logError) throw logError;

  return publication;
}

/**
 * Withdraw a submission (pending, live, or soft-rejected). Idempotent.
 *
 * HARD-rejected copies are deliberately NOT deleted: they are the evidence a
 * moderator reviews when looking at a flagged account, and withdrawing must
 * not launder them. Nothing about them is public (a hard rejection never went
 * live), and full account deletion still removes them via the FK CASCADE.
 */
export async function withdrawPublication(
  supabase: Client,
  sourceGameId: string,
  accountId: string,
): Promise<void> {
  const { error } = await supabase
    .from("games")
    .delete()
    .eq("source_game_id", sourceGameId)
    .eq("account_id", accountId)
    .not("publication_requested_at", "is", null)
    // NULL-safe "not hard-rejected": a bare neq would skip NULL rows.
    .or("rejection_kind.is.null,rejection_kind.neq.hard");
  if (error) throw error;
}

/**
 * Stamp a submission as approved. Called by the review pass — today the
 * service-role review endpoint; later the automated content harness.
 */
export async function approvePublication(
  supabase: Client,
  publicationId: string,
  approvedBy: "system" | "admin",
): Promise<Game> {
  const { data, error } = await supabase
    .from("games")
    .update({
      published_at: new Date().toISOString(),
      approved_by: approvedBy,
      // An admin can approve over a rejection; the verdict is superseded.
      rejected_at: null,
      rejection_kind: null,
      rejection_reasons: null,
    })
    .eq("id", publicationId)
    .not("publication_requested_at", "is", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PublicationError("Publication not found", 404);

  const { error: logError } = await supabase
    .from("game_publication_requests")
    .update({ outcome: "approved", decided_at: new Date().toISOString() })
    .eq("publication_game_id", publicationId)
    .is("outcome", null);
  if (logError) throw logError;

  return castGame(data);
}

/**
 * Stamp a submission as rejected. Hard rejections additionally flag the
 * account for review and — via the request log, which outlives the copy row —
 * permanently block resubmission of the source game.
 */
export async function rejectPublication(
  supabase: Client,
  publicationId: string,
  rejection: { kind: RejectionKind; reasons: PublicationRejectionReason[] },
): Promise<Game> {
  const reasonsJson = rejection.reasons as unknown as Json;
  const { data, error } = await supabase
    .from("games")
    .update({
      rejected_at: new Date().toISOString(),
      rejection_kind: rejection.kind,
      rejection_reasons: reasonsJson,
    })
    .eq("id", publicationId)
    .not("publication_requested_at", "is", null)
    .is("published_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  // Withdrawn (or already published) between claim and verdict: nothing to
  // stamp — the caller treats the 404 as a harmless skip.
  if (!data) throw new PublicationError("Publication not found", 404);
  const publication = castGame(data);

  const { error: logError } = await supabase
    .from("game_publication_requests")
    .update({
      outcome: "rejected",
      rejection_kind: rejection.kind,
      rejection_reasons: reasonsJson,
      decided_at: new Date().toISOString(),
    })
    .eq("publication_game_id", publicationId)
    .is("outcome", null);
  if (logError) throw logError;

  if (rejection.kind === "hard" && publication.account_id) {
    const { data: accountRow, error: accountError } = await supabase
      .from("accounts")
      .select("flagged_for_review_at")
      .eq("id", publication.account_id)
      .single();
    if (accountError) throw accountError;
    if (!accountRow.flagged_for_review_at) {
      const { error: flagError } = await supabase
        .from("accounts")
        .update({ flagged_for_review_at: new Date().toISOString() })
        .eq("id", publication.account_id);
      if (flagError) throw flagError;
    }
  }

  return publication;
}

/**
 * Submissions awaiting review, oldest first (the review queue). Rejected rows
 * are parked, not pending — they wait for the parent (soft) or forever (hard).
 * `maxAttempts` lets the worker skip items whose review budget is exhausted
 * while the operator endpoint keeps seeing them.
 */
export async function listPendingPublications(
  supabase: Client,
  limit = 50,
  maxAttempts?: number,
): Promise<Game[]> {
  let query = supabase
    .from("games")
    .select("*")
    .not("publication_requested_at", "is", null)
    .is("published_at", null)
    .is("rejected_at", null)
    .order("publication_requested_at", { ascending: true })
    .limit(limit);
  if (maxAttempts !== undefined) {
    query = query.lt("review_attempts", maxAttempts);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(castGame);
}
