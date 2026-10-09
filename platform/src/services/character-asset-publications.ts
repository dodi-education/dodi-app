import { validateCharacterAsset } from "@dodi/character/asset-validator";
import type { CharacterAssetKind } from "@dodi/types/database";

import type { Db } from "@/lib/db";

import { consumeRateLimit } from "./rate-limits";

/**
 * Discover for companion avatars and accessories (published_character_assets).
 *
 * A family submits a PLAINTEXT copy of one of its sealed assets; the server
 * re-validates the file (it can, only here) and a person approves it through
 * the ops endpoints. Other families add a live asset with a sharing row and
 * use it in place. Every function here runs on the service handle and scopes
 * by account explicitly: the publisher's account_id never leaves the server.
 */

export class AssetPublicationError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "handle_required"
      | "invalid_file"
      | "limit_reached"
      | "kind_mismatch",
    readonly details: string[] = [],
  ) {
    super(code);
    this.name = "AssetPublicationError";
  }
}

/** Submissions an account may make per 30 days (each one is a human review). */
export const ASSET_PUBLICATION_LIMIT = {
  bucket: "asset_publication",
  limit: 20,
  windowMs: 30 * 86_400_000,
};

/** The submitter's view of a submission. */
export interface AssetPublicationStatus {
  id: string;
  state: "in_review" | "live" | "rejected";
  submitted_at: string;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

/** A Discover card. */
export interface PublishedCharacterAssetCard {
  id: string;
  kind: CharacterAssetKind;
  name: string;
  description: string;
  socket: string | null;
  byte_size: number;
  preview_image: string | null;
  publisher_handle: string | null;
  published_at: string;
  /** This family added it. */
  is_added: boolean;
}

/** A published asset a family added, as its asset store lists it. */
export interface SharedCharacterAsset {
  id: string;
  kind: CharacterAssetKind;
  name: string;
  description: string;
  socket: string | null;
  byte_size: number;
  publisher_handle: string | null;
}

export interface SubmitAssetPublicationInput {
  accountId: string;
  sourceAssetId: string;
  name: string;
  description: string;
  glbBase64: string;
  previewImage: string | null;
}

function stateOf(row: {
  published_at: string | null;
  rejected_at: string | null;
}): AssetPublicationStatus["state"] {
  if (row.published_at) return "live";
  if (row.rejected_at) return "rejected";
  return "in_review";
}

function toStatus(row: {
  id: string;
  submitted_at: string;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}): AssetPublicationStatus {
  return {
    id: row.id,
    state: stateOf(row),
    submitted_at: row.submitted_at,
    published_at: row.published_at,
    rejected_at: row.rejected_at,
    rejection_reason: row.rejection_reason,
  };
}

/**
 * Submit (or resubmit) a plaintext copy of the account's asset. Resubmitting
 * replaces the earlier copy and sends it back to review; a live copy leaves
 * Discover until it is approved again.
 */
export async function submitAssetPublication(
  db: Db,
  input: SubmitAssetPublicationInput,
  now: Date = new Date(),
): Promise<AssetPublicationStatus> {
  const source = await db
    .selectFrom("character_assets")
    .select(["id", "kind"])
    .where("id", "=", input.sourceAssetId)
    .where("account_id", "=", input.accountId)
    .executeTakeFirst();
  if (!source) throw new AssetPublicationError("not_found");

  const account = await db
    .selectFrom("accounts")
    .select("publication_handle")
    .where("id", "=", input.accountId)
    .executeTakeFirstOrThrow();
  if (!account.publication_handle)
    throw new AssetPublicationError("handle_required");

  const bytes = Buffer.from(input.glbBase64, "base64");
  const report = validateCharacterAsset(new Uint8Array(bytes), source.kind);
  if (!report.isValid)
    throw new AssetPublicationError("invalid_file", report.errors);

  const limit = await consumeRateLimit(db, {
    accountId: input.accountId,
    ...ASSET_PUBLICATION_LIMIT,
    now,
  });
  if (!limit.allowed) throw new AssetPublicationError("limit_reached");

  const values = {
    kind: source.kind,
    name: input.name,
    description: input.description,
    socket: report.info.socket ?? null,
    // Normalized, so what is served is exactly what was validated.
    glb_base64: bytes.toString("base64"),
    byte_size: bytes.byteLength,
    preview_image: input.previewImage,
    submitted_at: now.toISOString(),
    published_at: null,
    rejected_at: null,
    rejection_reason: null,
  };
  const row = await db
    .insertInto("published_character_assets")
    .values({
      ...values,
      account_id: input.accountId,
      source_asset_id: source.id,
    })
    .onConflict((oc) =>
      oc
        .column("source_asset_id")
        .where("source_asset_id", "is not", null)
        .doUpdateSet(values),
    )
    .returning([
      "id",
      "submitted_at",
      "published_at",
      "rejected_at",
      "rejection_reason",
    ])
    .executeTakeFirstOrThrow();
  return toStatus(row);
}

export async function getAssetPublicationStatus(
  db: Db,
  accountId: string,
  sourceAssetId: string,
): Promise<AssetPublicationStatus | null> {
  const row = await db
    .selectFrom("published_character_assets")
    .select([
      "id",
      "submitted_at",
      "published_at",
      "rejected_at",
      "rejection_reason",
    ])
    .where("source_asset_id", "=", sourceAssetId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  return row ? toStatus(row) : null;
}

/** Take a submission (live or not) back. Families that added it lose it. */
export async function withdrawAssetPublication(
  db: Db,
  accountId: string,
  sourceAssetId: string,
): Promise<boolean> {
  const res = await db
    .deleteFrom("published_character_assets")
    .where("source_asset_id", "=", sourceAssetId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  return Number(res.numDeletedRows) > 0;
}

// ---------------------------------------------------------------------------
// Ops review
// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts (the queue,
// file and verdict shapes below are parsed there by the ops console).
// ---------------------------------------------------------------------------

export interface PendingAssetPublication {
  id: string;
  kind: CharacterAssetKind;
  name: string;
  description: string;
  socket: string | null;
  byte_size: number;
  preview_image: string | null;
  submitted_at: string;
  publisher_handle: string | null;
  account_id: string;
}

/** The review queue, oldest first. Ops only (it names the account). */
export async function listPendingAssetPublications(
  db: Db,
  limit = 50,
): Promise<PendingAssetPublication[]> {
  return db
    .selectFrom("published_character_assets as p")
    .innerJoin("accounts as a", "a.id", "p.account_id")
    .select([
      "p.id",
      "p.kind",
      "p.name",
      "p.description",
      "p.socket",
      "p.byte_size",
      "p.preview_image",
      "p.submitted_at",
      "p.account_id",
      "a.publication_handle as publisher_handle",
    ])
    .where("p.published_at", "is", null)
    .where("p.rejected_at", "is", null)
    .orderBy("p.submitted_at", "asc")
    .limit(limit)
    .execute();
}

/** The submitted file, for a reviewer (any state). */
export async function getAssetPublicationFile(
  db: Db,
  id: string,
): Promise<{
  kind: CharacterAssetKind;
  name: string;
  glb_base64: string;
} | null> {
  const row = await db
    .selectFrom("published_character_assets")
    .select(["kind", "name", "glb_base64"])
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

/** What a review verdict did: not_found and already_reviewed change nothing. */
export type AssetReviewOutcome = "ok" | "not_found" | "already_reviewed";

async function reviewOutcome(
  db: Db,
  id: string,
  updated: bigint,
): Promise<AssetReviewOutcome> {
  if (Number(updated) > 0) return "ok";
  const exists = await db
    .selectFrom("published_character_assets")
    .select("id")
    .where("id", "=", id)
    .executeTakeFirst();
  return exists ? "already_reviewed" : "not_found";
}

/** Put a submission live. An admin may approve over a rejection; a live one is already_reviewed. */
export async function approveAssetPublication(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<AssetReviewOutcome> {
  const res = await db
    .updateTable("published_character_assets")
    .set({
      published_at: now.toISOString(),
      rejected_at: null,
      rejection_reason: null,
    })
    .where("id", "=", id)
    .where("published_at", "is", null)
    .executeTakeFirst();
  return reviewOutcome(db, id, res.numUpdatedRows);
}

/**
 * Reject a pending submission, or take a live one down (it leaves Discover and
 * families that added it stop seeing it). An already rejected one is already_reviewed.
 */
export async function rejectAssetPublication(
  db: Db,
  id: string,
  reason: string,
  now: Date = new Date(),
): Promise<AssetReviewOutcome> {
  const res = await db
    .updateTable("published_character_assets")
    .set({
      rejected_at: now.toISOString(),
      rejection_reason: reason,
      published_at: null,
    })
    .where("id", "=", id)
    .where("rejected_at", "is", null)
    .executeTakeFirst();
  return reviewOutcome(db, id, res.numUpdatedRows);
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

/** Live assets, newest first, with whether `accountId` added each. */
export async function listPublishedAssets(
  db: Db,
  accountId: string,
  options: { kind?: CharacterAssetKind; limit?: number } = {},
): Promise<PublishedCharacterAssetCard[]> {
  let query = db
    .selectFrom("published_character_assets as p")
    .innerJoin("accounts as a", "a.id", "p.account_id")
    .leftJoin("character_asset_sharings as s", (join) =>
      join
        .onRef("s.published_asset_id", "=", "p.id")
        .on("s.account_id", "=", accountId),
    )
    .select([
      "p.id",
      "p.kind",
      "p.name",
      "p.description",
      "p.socket",
      "p.byte_size",
      "p.preview_image",
      "p.published_at",
      "a.publication_handle as publisher_handle",
      "s.account_id as added_by",
    ])
    .where("p.published_at", "is not", null)
    .orderBy("p.published_at", "desc")
    .limit(Math.min(options.limit ?? 60, 100));
  if (options.kind) query = query.where("p.kind", "=", options.kind);
  const rows = await query.execute();
  return rows.map(({ added_by, published_at, ...row }) => ({
    ...row,
    published_at: published_at as string,
    is_added: added_by !== null,
  }));
}

/** A live asset's file, for any signed-in family (it is public). */
export async function getPublishedAssetFile(
  db: Db,
  id: string,
): Promise<{ kind: CharacterAssetKind; glb_base64: string } | null> {
  const row = await db
    .selectFrom("published_character_assets")
    .select(["kind", "glb_base64"])
    .where("id", "=", id)
    .where("published_at", "is not", null)
    .executeTakeFirst();
  return row ?? null;
}

/** Add a live asset to the family. `serviceDb` checks it is live; `db` (RLS) writes the row. */
export async function addSharedAsset(
  db: Db,
  serviceDb: Db,
  accountId: string,
  id: string,
): Promise<void> {
  const live = await getPublishedAssetFile(serviceDb, id);
  if (!live) throw new AssetPublicationError("not_found");
  await db
    .insertInto("character_asset_sharings")
    .values({ account_id: accountId, published_asset_id: id })
    .onConflict((oc) =>
      oc.columns(["account_id", "published_asset_id"]).doNothing(),
    )
    .execute();
}

export async function removeSharedAsset(
  db: Db,
  accountId: string,
  id: string,
): Promise<void> {
  await db
    .deleteFrom("character_asset_sharings")
    .where("account_id", "=", accountId)
    .where("published_asset_id", "=", id)
    .execute();
}

/** The live assets this family added (plaintext), for its asset store. */
export async function listSharedAssets(
  serviceDb: Db,
  accountId: string,
): Promise<SharedCharacterAsset[]> {
  return serviceDb
    .selectFrom("character_asset_sharings as s")
    .innerJoin(
      "published_character_assets as p",
      "p.id",
      "s.published_asset_id",
    )
    .innerJoin("accounts as a", "a.id", "p.account_id")
    .select([
      "p.id",
      "p.kind",
      "p.name",
      "p.description",
      "p.socket",
      "p.byte_size",
      "a.publication_handle as publisher_handle",
    ])
    .where("s.account_id", "=", accountId)
    .where("p.published_at", "is not", null)
    .orderBy("s.created_at", "asc")
    .limit(100)
    .execute();
}
