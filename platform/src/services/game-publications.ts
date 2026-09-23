/**
 * Publication of a parent-created game to dodi Discover.
 *
 * A private game is end-to-end encrypted and stays that way forever. Requesting
 * publication FORKS it: the browser decrypts the content, posts it here, and we
 * insert a SECOND `games` row that is plaintext by design. Publishing is a
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
 * chain), no `kid_id`, and explicitly NOT `agent_transcript_enc`: the studio
 * conversation is the parent's, and is not part of what they chose to publish.
 *
 * Every write here uses the BYPASSRLS service handle: RLS deliberately forbids
 * users from inserting or updating rows with `publication_requested_at` set, so
 * a parent cannot edit a submission out from under review through their own
 * scoped handle. Each query is therefore scoped to the caller's account in
 * code, the same contract as the friends and snapshot-sharing services.
 */
import type {
  PublicationRejectionReason,
  RejectionKind,
} from "@dodi/protocol";
import { coveredLocales, extractTranslations } from "@dodi/games/translations";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import type { Game, GameInsert, Json } from "@dodi/types/database";
import { sanitizeGameBundle } from "../game-sanitizer";

import type { Db } from "@/lib/db";
import { triggerLandingRebuild } from "@/lib/landing-rebuild";

import { filterToCatalogTags } from "./games";
import { upsertTranslations } from "./game-translations";

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
  /** Per-locale listing content; the gate requires every platform locale. */
  translations?: Record<string, { title: string; description: string }>;
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

/** Start of the current UTC calendar month: the quota window boundary. */
function monthStartUtcIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** The publication copy of a source game, or null when it was never submitted. */
export async function getPublication(
  db: Db,
  sourceGameId: string,
  accountId: string,
): Promise<Game | null> {
  const row = await db
    .selectFrom("games")
    .selectAll()
    .where("source_game_id", "=", sourceGameId)
    .where("account_id", "=", accountId)
    .where("publication_requested_at", "is not", null)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * Upsert the DRAFT publication request of a source game: the translate step's
 * bookkeeping row (submitted_at NULL) holding the parent's paid listing
 * translations as a vault-sealed blob. Sealed because the source game is still
 * E2EE-private; the server may only ever hold these texts in plaintext once
 * the parent actually submits. At most one draft per source game.
 */
export async function savePublicationDraft(
  db: Db,
  input: {
    sourceGameId: string;
    accountId: string;
    /** enc:v1: blob of Record<locale, {title, description}>, sealed client-side. */
    listingTranslationsEnc: string;
  },
): Promise<void> {
  const { sourceGameId, accountId, listingTranslationsEnc } = input;

  const source = await db
    .selectFrom("games")
    .selectAll()
    .where("id", "=", sourceGameId)
    .executeTakeFirst();
  if (
    !source ||
    source.account_id !== accountId ||
    source.is_system ||
    source.publication_requested_at
  ) {
    throw new PublicationError("Game not found", 404);
  }

  const existingDraft = await db
    .updateTable("game_publication_requests")
    .set({ listing_translations_enc: listingTranslationsEnc })
    .where("source_game_id", "=", sourceGameId)
    .where("account_id", "=", accountId)
    .where("submitted_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!existingDraft) {
    await db
      .insertInto("game_publication_requests")
      .values({
        account_id: accountId,
        source_game_id: sourceGameId,
        listing_translations_enc: listingTranslationsEnc,
      })
      .execute();
  }
}

/** The draft request's sealed listing blob, or null when no draft exists. */
export async function getPublicationDraft(
  db: Db,
  sourceGameId: string,
  accountId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("game_publication_requests")
    .select("listing_translations_enc")
    .where("source_game_id", "=", sourceGameId)
    .where("account_id", "=", accountId)
    .where("submitted_at", "is", null)
    .executeTakeFirst();
  return row?.listing_translations_enc ?? null;
}

/**
 * Submit (or re-submit) a game for review. Re-submitting replaces the copy's
 * content and clears the approval, so an update always goes through review
 * again; the published artifact is never edited in place.
 */
export async function submitPublication(
  db: Db,
  input: {
    sourceGameId: string;
    accountId: string;
    content: PublicationContent;
  },
): Promise<Game> {
  const { sourceGameId, accountId, content } = input;

  const source = await db
    .selectFrom("games")
    .selectAll()
    .where("id", "=", sourceGameId)
    .executeTakeFirst();

  if (!source || source.account_id !== accountId || source.is_system) {
    throw new PublicationError("Game not found", 404);
  }
  if (source.publication_requested_at) {
    throw new PublicationError(
      "This game is already a publication copy",
      400,
    );
  }

  const account = await db
    .selectFrom("accounts")
    .select(["publication_handle", "monthly_game_publication_limit"])
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  if (!account.publication_handle) {
    throw new PublicationError(
      "Choose a publication handle before publishing",
      409,
    );
  }

  // A hard rejection is permanent for this source game. The check reads the
  // request log, not the copy row: withdraw deletes the copy, and deleting
  // must not lift the block.
  const { count: hardCount } = await db
    .selectFrom("game_publication_requests")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("source_game_id", "=", sourceGameId)
    .where("rejection_kind", "=", "hard")
    .executeTakeFirstOrThrow();
  if (Number(hardCount) > 0) {
    throw new PublicationError("publication_hard_rejected", 403);
  }

  // Monthly quota: EVERY submit counts (each one triggers a paid AI review),
  // including resubmits after a soft rejection. Drafts are free: their NULL
  // submitted_at never passes the month filter. Count-then-insert can overrun
  // by one under concurrent submits; accepted, the worst case is one extra
  // review, not worth a DB function.
  const { count: usedCount } = await db
    .selectFrom("game_publication_requests")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("account_id", "=", accountId)
    .where("submitted_at", ">=", monthStartUtcIso())
    .executeTakeFirstOrThrow();
  if (Number(usedCount) >= account.monthly_game_publication_limit) {
    throw new PublicationError("publication_limit_reached", 403);
  }

  // The one place the server CAN check the bundle, because this copy is
  // plaintext: real defence-in-depth for code that other families will run.
  const code = sanitizeGameBundle(content.codeBundle).code;

  // Published games must speak every platform language: the bundle's embedded
  // translations block has to cover each locale's full key set, and the
  // listing payload has to carry each locale's title/description. The client
  // translates before submitting (publish dialog); this is the enforcement.
  const { translations: block } = extractTranslations(code);
  if (!block) {
    throw new PublicationError("publication_translations_incomplete", 400);
  }
  const covered = coveredLocales(block, SUPPORTED_LOCALES);
  for (const locale of SUPPORTED_LOCALES) {
    const listing = content.translations?.[locale];
    if (!covered.has(locale) || !listing?.title.trim()) {
      throw new PublicationError("publication_translations_incomplete", 400);
    }
  }

  const payload: GameInsert = {
    account_id: accountId,
    published_by_account_id: accountId,
    source_game_id: sourceGameId,
    // Which build this is, so the dialog can tell whether the parent has
    // changed the game since submitting (see the column comment).
    source_game_version_id: source.current_game_version_id,
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
    available_locales: [...SUPPORTED_LOCALES],
  };

  const existing = await getPublication(db, sourceGameId, accountId);
  const publication: Game = existing
    ? await db
        .updateTable("games")
        .set(payload)
        .where("id", "=", existing.id)
        .returningAll()
        .executeTakeFirstOrThrow()
    : await db
        .insertInto("games")
        .values(payload)
        .returningAll()
        .executeTakeFirstOrThrow();

  // The submit log row: convert the translate step's draft when one exists
  // (stamping submitted_at is what makes it count toward quota; the sealed
  // listing blob is cleared, the plaintext game_translations rows written
  // below supersede it), else append a fresh submitted row.
  const stampedDraft = await db
    .updateTable("game_publication_requests")
    .set({
      submitted_at: new Date().toISOString(),
      publication_game_id: publication.id,
      listing_translations_enc: null,
    })
    .where("source_game_id", "=", sourceGameId)
    .where("account_id", "=", accountId)
    .where("submitted_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!stampedDraft) {
    await db
      .insertInto("game_publication_requests")
      .values({
        account_id: accountId,
        source_game_id: sourceGameId,
        publication_game_id: publication.id,
        submitted_at: new Date().toISOString(),
      })
      .execute();
  }

  // Listing translations for every locale (the gate above proved coverage).
  // Uniformly includes the source locale, so all reads go through one path.
  await upsertTranslations(
    db,
    publication.id,
    SUPPORTED_LOCALES.map((locale) => ({
      locale,
      title: content.translations![locale]!.title,
      description: content.translations![locale]!.description,
    })),
  );

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
  db: Db,
  sourceGameId: string,
  accountId: string,
): Promise<void> {
  const deleted = await db
    .deleteFrom("games")
    .where("source_game_id", "=", sourceGameId)
    .where("account_id", "=", accountId)
    .where("publication_requested_at", "is not", null)
    // NULL-safe "not hard-rejected": a bare != would skip NULL rows.
    .where((eb) =>
      eb.or([
        eb("rejection_kind", "is", null),
        eb("rejection_kind", "!=", "hard"),
      ]),
    )
    .returning("published_at")
    .execute();
  // A live game left the public catalogue: the marketing site lists it.
  if (deleted.some((row) => row.published_at !== null)) {
    await triggerLandingRebuild();
  }
}

/**
 * Stamp a submission as approved. Called by the review pass: today the
 * service-role review endpoint; later the automated content harness.
 */
export async function approvePublication(
  db: Db,
  publicationId: string,
  approvedBy: "system" | "admin",
): Promise<Game> {
  const publication = await db
    .updateTable("games")
    .set({
      published_at: new Date().toISOString(),
      approved_by: approvedBy,
      // An admin can approve over a rejection; the verdict is superseded.
      rejected_at: null,
      rejection_kind: null,
      rejection_reasons: null,
    })
    .where("id", "=", publicationId)
    .where("publication_requested_at", "is not", null)
    .returningAll()
    .executeTakeFirst();
  if (!publication) throw new PublicationError("Publication not found", 404);

  await db
    .updateTable("game_publication_requests")
    .set({ outcome: "approved", decided_at: new Date().toISOString() })
    .where("publication_game_id", "=", publicationId)
    .where("outcome", "is", null)
    .execute();

  // A game went live: the marketing site's games page lists the catalogue.
  await triggerLandingRebuild();

  return publication;
}

/**
 * Stamp a submission as rejected. Hard rejections additionally flag the
 * account for review and, via the request log, which outlives the copy row,
 * permanently block resubmission of the source game.
 */
export async function rejectPublication(
  db: Db,
  publicationId: string,
  rejection: { kind: RejectionKind; reasons: PublicationRejectionReason[] },
): Promise<Game> {
  // Pre-encode: pg binds a JS array as a Postgres array literal, not JSON, and
  // jsonb rejects it ("invalid input syntax for type json"). See lib/db-json.
  const reasonsJson = JSON.stringify(rejection.reasons) as unknown as Json;
  const publication = await db
    .updateTable("games")
    .set({
      rejected_at: new Date().toISOString(),
      rejection_kind: rejection.kind,
      rejection_reasons: reasonsJson,
    })
    .where("id", "=", publicationId)
    .where("publication_requested_at", "is not", null)
    .where("published_at", "is", null)
    .returningAll()
    .executeTakeFirst();
  // Withdrawn (or already published) between claim and verdict: nothing to
  // stamp; the caller treats the 404 as a harmless skip.
  if (!publication) throw new PublicationError("Publication not found", 404);

  await db
    .updateTable("game_publication_requests")
    .set({
      outcome: "rejected",
      rejection_kind: rejection.kind,
      rejection_reasons: reasonsJson,
      decided_at: new Date().toISOString(),
    })
    .where("publication_game_id", "=", publicationId)
    .where("outcome", "is", null)
    .execute();

  if (rejection.kind === "hard" && publication.account_id) {
    const accountRow = await db
      .selectFrom("accounts")
      .select("flagged_for_review_at")
      .where("id", "=", publication.account_id)
      .executeTakeFirstOrThrow();
    if (!accountRow.flagged_for_review_at) {
      await db
        .updateTable("accounts")
        .set({ flagged_for_review_at: new Date().toISOString() })
        .where("id", "=", publication.account_id)
        .execute();
    }
  }

  return publication;
}

/**
 * Submissions awaiting review, oldest first (the review queue). Rejected rows
 * are parked, not pending: they wait for the parent (soft) or forever (hard).
 * `maxAttempts` lets the worker skip items whose review budget is exhausted
 * while the operator endpoint keeps seeing them.
 */
export async function listPendingPublications(
  db: Db,
  limit = 50,
  maxAttempts?: number,
): Promise<Game[]> {
  let query = db
    .selectFrom("games")
    .selectAll()
    .where("publication_requested_at", "is not", null)
    .where("published_at", "is", null)
    .where("rejected_at", "is", null)
    .orderBy("publication_requested_at", "asc")
    .limit(limit);
  if (maxAttempts !== undefined) {
    query = query.where("review_attempts", "<", maxAttempts);
  }
  return await query.execute();
}
