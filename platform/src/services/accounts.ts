import type { Updateable } from "kysely";

import { parseGameScreenshotServiceSettings } from "@dodi/games/screenshot-contract";
import type { StoredDatePreferences } from "@dodi/intl";
import type {
  Account,
  Database,
  GameScreenshotServiceSettings,
  Json,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";

type AccountUpdate = Updateable<Database["accounts"]>;

export async function getAccount(
  db: Db,
  accountId: string,
): Promise<Account | null> {
  const row = await db
    .selectFrom("accounts")
    .selectAll()
    .where("id", "=", accountId)
    .executeTakeFirst();
  return row ?? null;
}

export async function updateAccount(
  db: Db,
  accountId: string,
  updates: AccountUpdate,
): Promise<Account> {
  return db
    .updateTable("accounts")
    .set(updates)
    .where("id", "=", accountId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Persist the parent's UI language (BCP-47 short code, e.g. "en"/"de"). This is
 * the durable source of truth; the client caches it in the `NEXT_LOCALE` cookie
 * and re-seeds that cookie from here at login so the choice follows the parent
 * across devices.
 */
export async function updateAccountLanguage(
  db: Db,
  accountId: string,
  language: string,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ language })
    .where("id", "=", accountId)
    .execute();
}

/**
 * Replace the account's date/time display preferences (the settings form submits
 * the full object, which becomes the entire `date_preferences` column). The
 * explicit timezone, when present, is already sealed (`enc:v1:`) by the client.
 */
export async function updateAccountDatePreferences(
  db: Db,
  accountId: string,
  datePreferences: StoredDatePreferences,
): Promise<StoredDatePreferences> {
  await db
    .updateTable("accounts")
    .set({ date_preferences: datePreferences as unknown as Json })
    .where("id", "=", accountId)
    .execute();
  return datePreferences;
}

/**
 * Plaintext account-level notification toggles (opt-out; unset ⇒ on). Kept
 * plaintext deliberately: the server reads these to decide whether to send
 * transactional email. Extend this shape as more notification types are added.
 */
export interface NotificationPreferences {
  friend_approval_email?: boolean;
  /** Outcome of a dodi Discover publication review (approved/rejected). */
  publication_outcome_email?: boolean;
}

/**
 * Merge partial notification toggles into the account's stored preferences (so
 * updating one toggle never clobbers the others) and return the merged result.
 */
export async function updateAccountNotificationPreferences(
  db: Db,
  accountId: string,
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const existing = await db
    .selectFrom("accounts")
    .select("notification_preferences")
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();

  const current = (existing.notification_preferences ??
    {}) as NotificationPreferences;
  const merged: NotificationPreferences = { ...current, ...prefs };

  await db
    .updateTable("accounts")
    .set({ notification_preferences: merged as unknown as Json })
    .where("id", "=", accountId)
    .execute();

  return merged;
}

/**
 * The account's Game Studio screenshot-service choice, parsed defensively from
 * the jsonb column (anything malformed reads as the default).
 */
export function gameScreenshotServiceOf(account: Account): GameScreenshotServiceSettings {
  return parseGameScreenshotServiceSettings(account.game_screenshot_service);
}

/**
 * Replace the account's screenshot-service choice (the settings form submits
 * the whole object, like date_preferences). `mode` stays plaintext so
 * POST /api/games/screenshot can enforce the opt-in; `customUrlEnc`, when
 * present, is already sealed (`enc:v1:`) by the client and never read here.
 */
export async function updateAccountGameScreenshotService(
  db: Db,
  accountId: string,
  settings: GameScreenshotServiceSettings,
): Promise<GameScreenshotServiceSettings> {
  await db
    .updateTable("accounts")
    .set({ game_screenshot_service: settings as unknown as Json })
    .where("id", "=", accountId)
    .execute();
  return settings;
}

/**
 * Set the account's PUBLIC publication handle — the author byline on games
 * published to dodi Discover. Plaintext on purpose: every real name in dodi is
 * E2EE, so a listing can only credit a name the parent deliberately chose for
 * publication (same reasoning as `kids.social_id`). Expects an already-validated,
 * normalized handle. Returns false on a uniqueness collision so the caller can
 * answer 409 rather than 500.
 */
export async function setAccountPublicationHandle(
  db: Db,
  accountId: string,
  handle: string,
): Promise<boolean> {
  try {
    await db
      .updateTable("accounts")
      .set({ publication_handle: handle })
      .where("id", "=", accountId)
      .execute();
  } catch (error) {
    // unique_violation on accounts_publication_handle_key: the handle is taken.
    if (isUniqueViolation(error, "accounts_publication_handle_key")) return false;
    throw error;
  }
  return true;
}

/**
 * Set-once npub bind at vault bootstrap: succeeds when the account's npub is
 * unset or already equal (idempotent re-save), fails when the npub belongs to
 * another account (unique violation) or this account is already bound to a
 * different npub (zero rows matched). The caller sends only the PUBLIC key —
 * the nsec never reaches the server.
 */
export async function claimAccountNpub(
  db: Db,
  accountId: string,
  npub: string,
): Promise<boolean> {
  let rows: { id: string }[];
  try {
    rows = await db
      .updateTable("accounts")
      .set({ npub })
      .where("id", "=", accountId)
      .where((eb) => eb.or([eb("npub", "is", null), eb("npub", "=", npub)]))
      .returning("id")
      .execute();
  } catch (error) {
    // unique_violation on accounts_npub_key: the npub is bound to another account.
    if (isUniqueViolation(error, "accounts_npub_key")) return false;
    throw error;
  }
  return rows.length > 0;
}

/**
 * Whether a handle is free. Needs the service db: RLS scopes account reads to
 * the caller, and a "taken?" answer must span every account. Returns only a
 * boolean — never a browsable list, same contract as friend lookup.
 */
export async function isPublicationHandleAvailable(
  serviceDb: Db,
  handle: string,
): Promise<boolean> {
  const row = await serviceDb
    .selectFrom("accounts")
    .select("id")
    .where("publication_handle", "=", handle)
    .executeTakeFirst();
  return row === undefined;
}

/**
 * Set or clear the account's parent PIN. The value, when present, is already
 * sealed (`enc:v1:`) by the client; `null` removes the PIN. The server never
 * sees the plaintext — it only stores/returns the opaque blob.
 */
export async function updateAccountParentPin(
  db: Db,
  accountId: string,
  parentPinEnc: string | null,
): Promise<void> {
  await db
    .updateTable("accounts")
    .set({ parent_pin_enc: parentPinEnc })
    .where("id", "=", accountId)
    .execute();
}
