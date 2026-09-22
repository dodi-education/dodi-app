/**
 * The ops console's two browse tables: accounts and games. Cross-account reads,
 * so everything runs on the BYPASSRLS service handle with an explicit column
 * projection, and every query is bounded by the page limit.
 *
 * E2EE boundary, deliberately narrow:
 *  - Accounts carry only plaintext operational columns (email, Better Auth
 *    display name, plan, counts, timestamps). Never the vault (`vault_keys`,
 *    `encrypted_api_keys`, `parent_pin_enc`) and never anything from `kids`
 *    beyond a row count.
 *  - Games are restricted to the PLAINTEXT rows: `is_system = true` OR
 *    `publication_requested_at IS NOT NULL`. A private game's title and
 *    description are ciphertext and are never selected, searched or ordered by.
 */
import { sql, type RawBuilder } from "kysely";
import { z } from "zod/v4";

import type { Json } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/** Page size defaults, shared by both tables. */
export const OPS_LIST_DEFAULT_LIMIT = 25;
export const OPS_LIST_MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// GET /api/internal/accounts
// ---------------------------------------------------------------------------

export const OPS_ACCOUNT_STATUS_FILTERS = [
  "all",
  "paid",
  "free",
  "trial",
  "past_due",
] as const;
export type OpsAccountStatusFilter = (typeof OPS_ACCOUNT_STATUS_FILTERS)[number];

export const OpsAccountsQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  plan: z.string().trim().max(40).optional(),
  status: z.enum(OPS_ACCOUNT_STATUS_FILTERS).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(OPS_LIST_MAX_LIMIT)
    .default(OPS_LIST_DEFAULT_LIMIT),
});
export type OpsAccountsQuery = z.infer<typeof OpsAccountsQuerySchema>;

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsAccountRow {
  id: string;
  email: string;
  /** Better Auth display name (plaintext). Empty string when unset. */
  name: string;
  createdAt: string;
  plan: {
    handle: string;
    title: string;
    priceEurMonth: number;
  };
  status: "paid" | "free";
  mrrEur: number;
  kidsCount: number;
  aiProviders: {
    voice: string | null;
    thinking: string | null;
    game: string | null;
    image: string | null;
  };
  aiSummary: "dodi" | "byok" | "mixed" | "unset";
  lastActiveAt: string | null;
  flaggedForReviewAt: string | null;
  publicationHandle: string | null;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsAccountsResponse {
  items: OpsAccountRow[];
  page: number;
  limit: number;
  total: number;
  totals: { accounts: number; kids: number };
  /** Set when the requested filter has no data source yet (trial, past due). */
  unavailable?: "billing";
}

// ---------------------------------------------------------------------------
// GET /api/internal/games
// ---------------------------------------------------------------------------

export const OPS_GAME_STATES = [
  "published",
  "requested",
  "declined_soft",
  "declined_hard",
] as const;
export type OpsGameState = (typeof OPS_GAME_STATES)[number];
export const OPS_GAME_STATE_FILTERS = ["all", ...OPS_GAME_STATES] as const;
export type OpsGameStateFilter = (typeof OPS_GAME_STATE_FILTERS)[number];
export const OPS_GAME_SORTS = [
  "submitted_desc",
  "rejected_desc",
  "plays_desc",
] as const;
export type OpsGameSort = (typeof OPS_GAME_SORTS)[number];

export const OpsGamesQuerySchema = z.object({
  state: z.enum(OPS_GAME_STATE_FILTERS).default("all"),
  query: z.string().trim().max(120).optional(),
  sort: z.enum(OPS_GAME_SORTS).default("submitted_desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(OPS_LIST_MAX_LIMIT)
    .default(OPS_LIST_DEFAULT_LIMIT),
});
export type OpsGamesQuery = z.infer<typeof OpsGamesQuerySchema>;

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsGameRow {
  id: string;
  title: string;
  /** Truncated to 160 characters server-side. */
  description: string;
  creator: {
    kind: "system" | "parent";
    handle: string | null;
    accountId: string | null;
    email: string | null;
  };
  /** First subject tag (capability tags `ai`, `ai-image` excluded). */
  category: string | null;
  tags: string[];
  state: OpsGameState;
  isSystem: boolean;
  plays: number;
  submittedAt: string | null;
  publishedAt: string | null;
  rejectedAt: string | null;
  rejectionKind: "hard" | "soft" | null;
  rejectionReasons: { code: string; note: string }[];
  reviewAttempts: number;
  availableLocales: string[] | null;
  createdAt: string;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsGamesResponse {
  items: OpsGameRow[];
  page: number;
  limit: number;
  total: number;
  totals: { published: number; openRequests: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capability tags never serve as a category (see @dodi/games tags). */
const CAPABILITY_TAGS = new Set(["ai", "ai-image"]);

/** A listing description is a table cell here, not a document. */
const DESCRIPTION_CHARS = 160;

/**
 * A contains-match pattern for `ilike`. The operator's own wildcards (`%`, `_`)
 * and the escape character are escaped, so a search for "a_b" cannot turn into
 * a single-character wildcard scan.
 */
function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** `where` fragment from a clause list; always a valid boolean expression. */
function andAll(clauses: RawBuilder<unknown>[]): RawBuilder<unknown> {
  if (clauses.length === 0) return sql`true`;
  return sql.join(clauses, sql` and `);
}

/** One provider id out of an `accounts.model_config` blob, or null. */
function configuredProvider(config: Json | null, key: string): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function summarizeProviders(
  providers: readonly (string | null)[],
): OpsAccountRow["aiSummary"] {
  const configured = providers.filter((p): p is string => p !== null);
  if (configured.length === 0) return "unset";
  const managed = configured.filter((p) => p === "dodi").length;
  if (managed === configured.length) return "dodi";
  if (managed === 0) return "byok";
  return "mixed";
}

/** Clamp to exactly `max` characters, ellipsis included. */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** `games.rejection_reasons` is free-form jsonb; keep only well-formed entries. */
function toRejectionReasons(value: Json | null): { code: string; note: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { code, note } = entry as Record<string, unknown>;
    if (typeof code !== "string") return [];
    return [{ code, note: typeof note === "string" ? note : "" }];
  });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

interface AccountSqlRow {
  id: string;
  email: string;
  auth_name: string | null;
  created_at: string;
  model_config: Json | null;
  flagged_for_review_at: string | null;
  publication_handle: string | null;
  plan_handle: string;
  plan_title: string | null;
  price_eur_month: number;
  kids_count: number;
  last_active_at: string | null;
}

async function accountTotals(
  db: Db,
): Promise<{ accounts: number; kids: number }> {
  const { rows } = await sql<{ accounts: number; kids: number }>`
    select (select count(*) from accounts)::int as accounts,
           (select count(*) from kids)::int as kids
  `.execute(db);
  return {
    accounts: Number(rows[0]?.accounts ?? 0),
    kids: Number(rows[0]?.kids ?? 0),
  };
}

/**
 * One page of accounts for the ops console.
 *
 * `trial` and `past_due` have no data source until subscriptions exist, so they
 * answer with an empty page plus `unavailable: "billing"` rather than silently
 * returning every account under a filter that means nothing yet.
 */
export async function listOpsAccounts(
  db: Db,
  query: OpsAccountsQuery,
): Promise<OpsAccountsResponse> {
  const totals = await accountTotals(db);

  if (query.status === "trial" || query.status === "past_due") {
    return {
      items: [],
      page: query.page,
      limit: query.limit,
      total: 0,
      totals,
      unavailable: "billing",
    };
  }

  const clauses: RawBuilder<unknown>[] = [];
  if (query.query) {
    const pattern = containsPattern(query.query);
    clauses.push(
      sql`(accounts.email ilike ${pattern} or coalesce(auth_users.name, '') ilike ${pattern})`,
    );
  }
  if (query.plan) {
    clauses.push(sql`accounts.subscribed_plan = ${query.plan}`);
  }
  if (query.status === "paid") {
    clauses.push(sql`coalesce(platform_plans.price_eur_month, 0) > 0`);
  } else if (query.status === "free") {
    clauses.push(sql`coalesce(platform_plans.price_eur_month, 0) = 0`);
  }
  const where = andAll(clauses);

  const joins = sql`
    from accounts
    left join auth_users on auth_users.id = accounts.id
    left join platform_plans on platform_plans.handle = accounts.subscribed_plan
    where ${where}
  `;

  const [countResult, rowsResult] = await Promise.all([
    sql<{ count: number }>`select count(*)::int as count ${joins}`.execute(db),
    sql<AccountSqlRow>`
      select accounts.id,
             accounts.email,
             accounts.created_at,
             accounts.model_config,
             accounts.flagged_for_review_at,
             accounts.publication_handle,
             accounts.subscribed_plan as plan_handle,
             auth_users.name as auth_name,
             platform_plans.title as plan_title,
             coalesce(platform_plans.price_eur_month, 0)::float8 as price_eur_month,
             (select count(*) from kids k where k.account_id = accounts.id)::int
               as kids_count,
             -- greatest() skips NULLs, so an account with only sessions (or
             -- only activities) still reports the timestamp it does have.
             greatest(
               (select max(ac.occurred_at) from activities ac
                 where ac.account_id = accounts.id),
               (select max(s.updated_at) from auth_sessions s
                 where s.user_id = accounts.id)
             ) as last_active_at
      ${joins}
      order by accounts.created_at desc, accounts.id asc
      limit ${query.limit} offset ${(query.page - 1) * query.limit}
    `.execute(db),
  ]);

  return {
    items: rowsResult.rows.map((row) => {
      const price = Number(row.price_eur_month);
      const aiProviders = {
        voice: configuredProvider(row.model_config, "voiceProvider"),
        thinking: configuredProvider(row.model_config, "thinkingProvider"),
        game: configuredProvider(row.model_config, "gameProvider"),
        image: configuredProvider(row.model_config, "imageProvider"),
      };
      return {
        id: row.id,
        email: row.email,
        name: row.auth_name ?? "",
        createdAt: row.created_at,
        plan: {
          handle: row.plan_handle,
          title: row.plan_title ?? row.plan_handle,
          priceEurMonth: price,
        },
        status: price > 0 ? ("paid" as const) : ("free" as const),
        mrrEur: price,
        kidsCount: Number(row.kids_count),
        aiProviders,
        aiSummary: summarizeProviders([
          aiProviders.voice,
          aiProviders.thinking,
          aiProviders.game,
          aiProviders.image,
        ]),
        lastActiveAt: row.last_active_at,
        flaggedForReviewAt: row.flagged_for_review_at,
        publicationHandle: row.publication_handle,
      };
    }),
    page: query.page,
    limit: query.limit,
    total: Number(countResult.rows[0]?.count ?? 0),
    totals,
  };
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

interface GameSqlRow {
  id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  is_system: boolean;
  publication_requested_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
  rejection_kind: "hard" | "soft" | null;
  rejection_reasons: Json | null;
  review_attempts: number;
  available_locales: string[] | null;
  created_at: string;
  creator_account_id: string | null;
  creator_email: string | null;
  creator_handle: string | null;
  plays: number;
}

/**
 * The console's four-state view of a plaintext game row. An admin approval
 * clears the rejection stamps, so "published" wins over a stale verdict.
 */
function deriveState(row: {
  is_system: boolean;
  published_at: string | null;
  rejected_at: string | null;
  rejection_kind: "hard" | "soft" | null;
}): OpsGameState {
  if (row.published_at !== null || row.is_system) return "published";
  if (row.rejected_at !== null) {
    return row.rejection_kind === "hard" ? "declined_hard" : "declined_soft";
  }
  return "requested";
}

async function gameTotals(
  db: Db,
): Promise<{ published: number; openRequests: number }> {
  const { rows } = await sql<{ published: number; open_requests: number }>`
    select count(*) filter (
             where published_at is not null or is_system
           )::int as published,
           count(*) filter (
             where publication_requested_at is not null
               and published_at is null
               and rejected_at is null
           )::int as open_requests
    from games
  `.execute(db);
  return {
    published: Number(rows[0]?.published ?? 0),
    openRequests: Number(rows[0]?.open_requests ?? 0),
  };
}

export async function listOpsGames(
  db: Db,
  query: OpsGamesQuery,
): Promise<OpsGamesResponse> {
  const totals = await gameTotals(db);

  // THE E2EE GATE: only plaintext rows are ever read, searched or ordered here.
  const clauses: RawBuilder<unknown>[] = [
    sql`(games.is_system = true or games.publication_requested_at is not null)`,
  ];
  if (query.query) {
    const pattern = containsPattern(query.query);
    clauses.push(
      sql`(games.title ilike ${pattern} or games.description ilike ${pattern})`,
    );
  }
  if (query.state === "published") {
    clauses.push(sql`(games.published_at is not null or games.is_system = true)`);
  } else if (query.state === "requested") {
    clauses.push(sql`(
      games.is_system = false
      and games.published_at is null
      and games.rejected_at is null
      and games.publication_requested_at is not null
    )`);
  } else if (query.state === "declined_soft" || query.state === "declined_hard") {
    const kind = query.state === "declined_hard" ? "hard" : "soft";
    clauses.push(sql`(
      games.published_at is null
      and games.rejected_at is not null
      and games.rejection_kind = ${kind}
    )`);
  }
  const where = andAll(clauses);

  // Authorship first, ownership as the fallback (a publication copy carries
  // both; a system row carries neither).
  const joins = sql`
    from games
    left join accounts creator
      on creator.id = coalesce(games.published_by_account_id, games.account_id)
    where ${where}
  `;

  const orderBy =
    query.sort === "plays_desc"
      ? sql`plays desc, games.created_at desc`
      : query.sort === "rejected_desc"
        ? sql`games.rejected_at desc nulls last, games.created_at desc`
        : sql`games.publication_requested_at desc nulls last, games.created_at desc`;

  const [countResult, rowsResult] = await Promise.all([
    sql<{ count: number }>`select count(*)::int as count ${joins}`.execute(db),
    sql<GameSqlRow>`
      select games.id,
             games.title,
             games.description,
             games.tags,
             games.is_system,
             games.publication_requested_at,
             games.published_at,
             games.rejected_at,
             games.rejection_kind,
             games.rejection_reasons,
             games.review_attempts,
             games.available_locales,
             games.created_at,
             creator.id as creator_account_id,
             creator.email as creator_email,
             creator.publication_handle as creator_handle,
             (select count(*) from game_plays p where p.game_id = games.id)::int
               as plays
      ${joins}
      order by ${orderBy}
      limit ${query.limit} offset ${(query.page - 1) * query.limit}
    `.execute(db),
  ]);

  return {
    items: rowsResult.rows.map((row) => {
      const tags = row.tags ?? [];
      return {
        id: row.id,
        title: row.title,
        description: truncate(row.description ?? "", DESCRIPTION_CHARS),
        creator: row.is_system
          ? { kind: "system" as const, handle: null, accountId: null, email: null }
          : {
              kind: "parent" as const,
              handle: row.creator_handle,
              accountId: row.creator_account_id,
              email: row.creator_email,
            },
        category: tags.find((tag) => !CAPABILITY_TAGS.has(tag)) ?? null,
        tags,
        state: deriveState(row),
        isSystem: row.is_system,
        plays: Number(row.plays),
        submittedAt: row.publication_requested_at,
        publishedAt: row.published_at,
        rejectedAt: row.rejected_at,
        rejectionKind: row.rejection_kind,
        rejectionReasons: toRejectionReasons(row.rejection_reasons),
        reviewAttempts: Number(row.review_attempts),
        availableLocales: row.available_locales,
        createdAt: row.created_at,
      };
    }),
    page: query.page,
    limit: query.limit,
    total: Number(countResult.rows[0]?.count ?? 0),
    totals,
  };
}
