import type {
  CharacterAsset,
  CharacterAssetKind,
  CharacterAssetSummary,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";

/**
 * A family's own avatars and accessories (character_assets). Every field but
 * `kind` and `byte_size` is an enc:v1 record sealed on the client: the server
 * stores and returns them verbatim and can't check the file inside (the
 * client validates it with @dodi/character before sealing).
 */

/** Assets an account can hold at most (avatars and accessories together). */
export const MAX_CHARACTER_ASSETS_PER_ACCOUNT = 50;

/** Plaintext .glb budgets per kind (characters/validate.py). */
export const CHARACTER_ASSET_MAX_BYTES: Record<CharacterAssetKind, number> = {
  avatar: 3 * 1024 * 1024,
  accessory: 1024 * 1024,
};

/** Sealed glb_enc length caps per kind (mirror character_assets_glb_enc_length_check). */
export const CHARACTER_ASSET_MAX_GLB_ENC_LENGTH: Record<
  CharacterAssetKind,
  number
> = {
  avatar: 5_600_000,
  accessory: 1_900_000,
};

export class CharacterAssetError extends Error {
  constructor(
    readonly code: "not_found" | "asset_limit_reached" | "too_large",
  ) {
    super(code);
    this.name = "CharacterAssetError";
  }
}

const SUMMARY_COLUMNS = [
  "id",
  "kind",
  "name_enc",
  "meta_enc",
  "byte_size",
  "created_at",
  "updated_at",
] as const;

export interface CharacterAssetCreate {
  kind: CharacterAssetKind;
  name_enc: string;
  meta_enc?: string | null;
  glb_enc: string;
  byte_size: number;
}

export interface CharacterAssetPatch {
  name_enc?: string;
  meta_enc?: string | null;
  glb_enc?: string;
  byte_size?: number;
}

function assertWithinBudget(
  kind: CharacterAssetKind,
  byteSize: number | undefined,
  glbEnc: string | undefined,
): void {
  if (byteSize !== undefined && byteSize > CHARACTER_ASSET_MAX_BYTES[kind]) {
    throw new CharacterAssetError("too_large");
  }
  if (
    glbEnc !== undefined &&
    glbEnc.length > CHARACTER_ASSET_MAX_GLB_ENC_LENGTH[kind]
  ) {
    throw new CharacterAssetError("too_large");
  }
}

/** The account's assets without their files, oldest first (bounded by the cap). */
export async function listCharacterAssets(
  db: Db,
  accountId: string,
): Promise<CharacterAssetSummary[]> {
  return db
    .selectFrom("character_assets")
    .select(SUMMARY_COLUMNS)
    .where("account_id", "=", accountId)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(MAX_CHARACTER_ASSETS_PER_ACCOUNT)
    .execute();
}

/** One asset with its sealed file. */
export async function getCharacterAsset(
  db: Db,
  accountId: string,
  assetId: string,
): Promise<CharacterAsset> {
  const row = await db
    .selectFrom("character_assets")
    .selectAll()
    .where("id", "=", assetId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!row) throw new CharacterAssetError("not_found");
  return row;
}

/** Stores a sealed asset; returns it without the file. */
export async function createCharacterAsset(
  db: Db,
  accountId: string,
  input: CharacterAssetCreate,
): Promise<CharacterAssetSummary> {
  assertWithinBudget(input.kind, input.byte_size, input.glb_enc);
  const { count } = await db
    .selectFrom("character_assets")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  if (Number(count) >= MAX_CHARACTER_ASSETS_PER_ACCOUNT) {
    throw new CharacterAssetError("asset_limit_reached");
  }
  return db
    .insertInto("character_assets")
    .values({
      account_id: accountId,
      kind: input.kind,
      name_enc: input.name_enc,
      meta_enc: input.meta_enc ?? null,
      glb_enc: input.glb_enc,
      byte_size: input.byte_size,
    })
    .returning(SUMMARY_COLUMNS)
    .executeTakeFirstOrThrow();
}

/** Replaces sealed fields (the kind stays); returns the asset without the file. */
export async function updateCharacterAsset(
  db: Db,
  accountId: string,
  assetId: string,
  patch: CharacterAssetPatch,
): Promise<CharacterAssetSummary> {
  const current = await db
    .selectFrom("character_assets")
    .select(["kind"])
    .where("id", "=", assetId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!current) throw new CharacterAssetError("not_found");
  assertWithinBudget(current.kind, patch.byte_size, patch.glb_enc);

  const values: CharacterAssetPatch = {};
  if (patch.name_enc !== undefined) values.name_enc = patch.name_enc;
  if (patch.meta_enc !== undefined) values.meta_enc = patch.meta_enc;
  if (patch.glb_enc !== undefined) values.glb_enc = patch.glb_enc;
  if (patch.byte_size !== undefined) values.byte_size = patch.byte_size;
  if (Object.keys(values).length === 0) {
    return db
      .selectFrom("character_assets")
      .select(SUMMARY_COLUMNS)
      .where("id", "=", assetId)
      .where("account_id", "=", accountId)
      .executeTakeFirstOrThrow();
  }
  const row = await db
    .updateTable("character_assets")
    .set(values)
    .where("id", "=", assetId)
    .where("account_id", "=", accountId)
    .returning(SUMMARY_COLUMNS)
    .executeTakeFirst();
  // Zero rows matched is not an error in Postgres; here it means the asset is gone.
  if (!row) throw new CharacterAssetError("not_found");
  return row;
}

/**
 * Deletes an asset. Looks that wear it are sealed, so nothing else changes
 * here: clients drop unknown custom refs (sanitizeLook) and fall back.
 */
export async function deleteCharacterAsset(
  db: Db,
  accountId: string,
  assetId: string,
): Promise<void> {
  const deleted = await db
    .deleteFrom("character_assets")
    .where("id", "=", assetId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (Number(deleted.numDeletedRows) === 0)
    throw new CharacterAssetError("not_found");
}
