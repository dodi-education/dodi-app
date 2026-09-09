/**
 * Database types.
 *
 * `DB` (and the per-table interfaces) are generated from the live schema by
 * `pnpm --filter @dodi/platform db:codegen` into ./database.generated.ts; never
 * edit that file by hand. This module layers the app-facing aliases on top:
 * `Kid`, `Game`, `Account`, … are the read shapes (what a SELECT returns, with
 * timestamps as ISO strings), `*Insert` / `*Update` the write shapes (generated
 * columns optional). Anything that is not a plain table row (embedded
 * projections, literal unions, protocol cards) is declared here.
 */
import type { Insertable, Selectable, Updateable } from "kysely";

import type { DB } from "./database.generated";

export type {
  DB,
  Json,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./database.generated";
import type { Json } from "./database.generated";

/** The Kysely database schema (the generated `DB`). */
export type Database = DB;

type Row<T extends keyof DB> = Selectable<DB[T]>;
type Insert<T extends keyof DB> = Insertable<DB[T]>;
type Update<T extends keyof DB> = Updateable<DB[T]>;

// Convenience type aliases
export type Account = Row<"accounts">;
export type MemoryTier = "basic" | "advanced" | "full";
export type PlatformPlan = Row<"platform_plans">;
export type PlatformPlanInsert = Insert<"platform_plans">;
export type PlatformPlanTranslation = Row<"platform_plan_translations">;
export type PlatformConfig = Row<"platform_config">;
export type AiUsageLog = Row<"ai_usage_logs">;
export type AiUsageLogInsert = Insert<"ai_usage_logs">;
/** @deprecated Prefer AiUsageLog — alias kept for gradual call-site updates. */
export type UsageEvent = AiUsageLog;
/** @deprecated Prefer AiUsageLogInsert */
export type UsageEventInsert = AiUsageLogInsert;
export type ErrorLog = Row<"error_logs">;
export type ErrorLogInsert = Insert<"error_logs">;
/**
 * Slim persona projection embedded in kid read shapes ("data travels with the
 * row that owns it"): the API joins it server-side via the active_persona_id
 * FK so clients never fetch /api/personas just to label a kid. Excludes the
 * heavy `soul` doc — AI flows load the full persona at session start. `name`
 * is E2EE ciphertext for account personas (decrypted in decryptKid).
 */
export interface KidActivePersona {
  id: string;
  name: string;
  account_id: string | null;
  is_system_default: boolean;
}
/**
 * Kid API read shape: the raw active_persona_id FK is replaced by the embedded
 * `active_persona` object. Write shapes (Insert/Update) still take the id.
 */
export type Kid = Omit<Row<"kids">, "active_persona_id" | "avatar_config"> & {
  active_persona: KidActivePersona | null;
  /** enc:v1: ciphertext on the wire; the decrypted { color, avatar } object client-side. */
  avatar_config: Json | null;
};
export type Persona = Row<"personas">;
export type Game = Row<"games">;
export type GamePlay = Row<"game_plays">;
export type GamePlayInsert = Insert<"game_plays">;
export type GamePlayUpdate = Update<"game_plays">;
export type GameSnapshot = Row<"game_snapshots">;
export type GameSnapshotInsert = Insert<"game_snapshots">;
export type GameSnapshotUpdate = Update<"game_snapshots">;
/** own = saved by the kid; received = sealed to them by a friend (share). */
export type SnapshotOrigin = "own" | "received" | "autosave";
export type Activity = Row<"activities">;
export type ActivityInsert = Insert<"activities">;
/** @deprecated Prefer Activity */
export type EventLog = Activity;
/** @deprecated Prefer ActivityInsert */
export type EventLogInsert = ActivityInsert;

export type Transcript = Row<"transcripts">;
export type TranscriptInsert = Insert<"transcripts">;
export type TranscriptUpdate = Update<"transcripts">;
export type TranscriptEntry = Row<"transcript_entries">;
export type TranscriptEntryInsert = Insert<"transcript_entries">;
export type Memory = Row<"memories">;
export type MemoryInsert = Insert<"memories">;
export type MemoryUpdate = Update<"memories">;
export type MemorySource = Row<"memory_sources">;
export type MemorySourceInsert = Insert<"memory_sources">;
export type MemoryRelation = "supports" | "contradicts";
export type MemoryStatus = "active" | "discarded";
export type MemoryDiscardedBy = "system" | "parent";
export type TranscriptStatus = "open" | "processed";
export type TranscriptEntryRole = "dodi" | "kid";

/**
 * Slim transcript-entry projection embedded in memory-source read shapes
 * (?includeSources=1) so dossier citations resolve without a second fetch.
 * content_enc stays E2EE ciphertext; decryption is client-side.
 */
export interface MemorySourceEntryRef {
  id: string;
  role: TranscriptEntryRole;
  content_enc: string;
  occurred_at: string;
}

/** Read shape of a memory source with its cited entry embedded (may be null if the entry row is gone). */
export interface MemorySourceWithEntry extends MemorySource {
  entry: MemorySourceEntryRef | null;
}
export type Device = Row<"devices">;
export type DeviceInsert = Insert<"devices">;
export type DeviceUpdate = Update<"devices">;
export type DeviceStatus = "pending" | "active" | "revoked";

export type InviteCode = Row<"invite_codes">;
export type InviteCodeInsert = Insert<"invite_codes">;
export type InviteCodeUpdate = Update<"invite_codes">;
export type InviteCodeRedemption = Row<"invite_code_redemptions">;

export type NewsletterSignup = Row<"newsletter_signups">;
export type NewsletterSignupInsert = Insert<"newsletter_signups">;

/** Registration gate controlled by the platform's REGISTRATION_MODE env var. */
export type RegistrationMode = "open" | "invite" | "closed";
export type KidInsert = Insert<"kids">;
export type KidUpdate = Update<"kids">;

export type Friendship = Row<"friendships">;
export type FriendshipInsert = Insert<"friendships">;
export type FriendshipUpdate = Update<"friendships">;

/** Lifecycle of a friendship. See @dodi/protocol friend-card + friends service. */
export type FriendshipStatus =
  | "pending"
  | "awaiting_parent"
  | "accepted"
  | "rejected"
  | "blocked";

/**
 * The minimal identity a kid reveals with a friend *request* — shown to the
 * addressee so they can decide. Sealed to the addressee's kid KEM key.
 */
export interface FriendPreviewCard {
  displayName: string;
  avatarConfig: Json | null;
}

/**
 * The full card exchanged once a friendship is `accepted` — adds birthdate.
 * Sealed to the recipient kid's KEM key; server gates delivery by status.
 */
export interface FriendCard extends FriendPreviewCard {
  birthdate: string | null;
}

export type PersonaInsert = Insert<"personas">;
export type PersonaUpdate = Update<"personas">;
export type GameInsert = Insert<"games">;
export type GameUpdate = Update<"games">;
export type GameVersion = Row<"game_versions">;
export type GameVersionInsert = Insert<"game_versions">;
export type GameSharing = Row<"game_sharings">;
export type GameSharingInsert = Insert<"game_sharings">;
export type GameSharingUpdate = Update<"game_sharings">;
export type GameFavorite = Row<"game_favorites">;
export type GameFavoriteInsert = Insert<"game_favorites">;
export type GameTranslation = Row<"game_translations">;
export type GamePublicationRequest = Row<"game_publication_requests">;
export type GamePublicationRequestInsert = Insert<"game_publication_requests">;
export type GamePublicationRequestUpdate = Update<"game_publication_requests">;

/** Better Auth rows (platform-internal; never exposed through the API). */
export type AuthUser = Row<"auth_users">;
export type AuthSession = Row<"auth_sessions">;
