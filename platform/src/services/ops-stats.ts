/**
 * Aggregates behind the ops console's dashboard: KPI strip, game/publication
 * funnel and the AI request share. Every read here goes through the BYPASSRLS
 * service handle because the console is cross-account by definition.
 *
 * E2EE boundary: this module counts rows and sums timestamps, it never reads
 * content. No kid name, birthdate, memory or parent note, no vault material,
 * and no private game text is selected anywhere below. Counts and timestamps on
 * E2EE tables are fine, the columns themselves are not.
 */
import { sql } from "kysely";

import type { Db } from "@/lib/db";

import {
  fillDays,
  type DailyPoint,
  type OpsRange,
} from "./ops-range";

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface KpiSeries {
  current: number;
  previous: number;
  daily: DailyPoint[];
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface NullableKpiSeries {
  current: number | null;
  previous: number | null;
  daily: DailyPoint[];
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsMrrPlanLine {
  handle: string;
  title: string;
  priceEurMonth: number;
  accounts: number;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsKpisResponse {
  generatedAt: string;
  range: OpsRange;
  totals: {
    accounts: number;
    kids: number;
    publishedGames: number;
    openPublicationRequests: number;
    serverErrorsInRange: number;
  };
  /** Plan-price proxy until subscriptions exist: sum of price over subscribed_plan. */
  mrr: {
    currentEur: number;
    source: "subscribed_plans";
    byPlan: OpsMrrPlanLine[];
  };
  /** Average distinct kids per day (game plays or session starts). */
  activeKids: KpiSeries;
  newSignups: KpiSeries;
  /** Average per kid-day of summed play durations, seconds. Null when no plays. */
  avgSessionSeconds: NullableKpiSeries;
  /** Explicit nulls: no billing source yet, the console renders placeholders. */
  trialToPaid: null;
  churn: null;
  /** Accounts created in the window, and how far each got. */
  funnel: {
    cohortAccounts: number;
    withKid: number;
    withPlay: number;
    withDodiAi: number;
  };
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsGameStatsResponse {
  range: OpsRange;
  created: {
    total: number;
    byTag: { tag: string; count: number }[];
    untagged: number;
    /** Share (0..1) of games created in the window with at least two plays. */
    replayedShare: number | null;
  };
  publications: {
    pending: number;
    approvedInRange: number;
    rejectedSoftInRange: number;
    rejectedHardInRange: number;
    /** Pending items the review worker gave up on (attempts exhausted). */
    parked: number;
  };
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsAiRequestsResponse {
  range: OpsRange;
  totalRequests: number;
  voiceSeconds: number;
  byProvider: { provider: string; requests: number; voiceSeconds: number }[];
  /** Share (0..1) of requests served by dodi AI; null when there were none. */
  managedShare: number | null;
  byokShare: number | null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Capability tags never count as a subject/category (see @dodi/games tags). */
const CAPABILITY_TAGS = ["ai", "ai-image"] as const;

/** Attempts a submission gets before it parks (mirrors MAX_REVIEW_ATTEMPTS). */
const PARKED_REVIEW_ATTEMPTS = 3;

/** Tag rows shown on the games dashboard. */
const TAG_BREAKDOWN_LIMIT = 8;

/** Two decimals is plenty for an average-per-day figure the console renders. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface DayValueRow {
  day: string;
  value: number;
}

/**
 * Distinct kids per UTC day that played a game or started a session. Union of
 * two sources: `game_plays` (bucketed by `created_at`, which is indexed —
 * `started_at` is not) and `activities` session/game-start events (bucketed by
 * `occurred_at`, the event's own clock).
 */
async function activeKidDays(
  db: Db,
  from: string,
  to: string,
): Promise<DayValueRow[]> {
  const { rows } = await sql<DayValueRow>`
    with active as (
      select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
             kid_id
      from game_plays
      where created_at >= ${from} and created_at < ${to}
      union
      select to_char(occurred_at at time zone 'utc', 'YYYY-MM-DD') as day,
             kid_id
      from activities
      where event in ('session_start', 'game_started')
        and occurred_at >= ${from} and occurred_at < ${to}
    )
    select day, count(distinct kid_id)::int as value
    from active
    group by day
    order by day
  `.execute(db);
  return rows;
}

/** Accounts created per UTC day. */
async function signupDays(
  db: Db,
  from: string,
  to: string,
): Promise<DayValueRow[]> {
  const { rows } = await sql<DayValueRow>`
    select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
           count(*)::int as value
    from accounts
    where created_at >= ${from} and created_at < ${to}
    group by day
    order by day
  `.execute(db);
  return rows;
}

interface SessionSecondsRow {
  day: string | null;
  value: number | null;
  is_total: number;
}

/**
 * Average session seconds per kid-day: every finished play of one kid on one
 * day is summed, then those per-kid-day totals are averaged. `rollup` returns
 * the per-day averages AND the window-wide average (is_total = 1) in one pass.
 * Plays are bucketed by `created_at` for the same index reason as above; the
 * duration itself comes from started_at/ended_at.
 */
async function sessionSecondsRows(
  db: Db,
  from: string,
  to: string,
): Promise<SessionSecondsRow[]> {
  const { rows } = await sql<SessionSecondsRow>`
    with per_kid_day as (
      select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
             kid_id,
             sum(extract(epoch from (ended_at - started_at))) as seconds
      from game_plays
      where ended_at is not null
        and created_at >= ${from} and created_at < ${to}
      group by 1, 2
    )
    select day, avg(seconds)::float8 as value, grouping(day)::int as is_total
    from per_kid_day
    group by rollup(day)
  `.execute(db);
  return rows;
}

// ---------------------------------------------------------------------------
// GET /api/internal/stats/kpis
// ---------------------------------------------------------------------------

interface FunnelRow {
  cohort_accounts: number;
  with_kid: number;
  with_play: number;
  with_dodi_ai: number;
}

interface MrrRow {
  handle: string;
  title: string;
  price_eur_month: number;
  accounts: number;
}

export async function getOpsKpis(
  db: Db,
  range: OpsRange,
): Promise<OpsKpisResponse> {
  const [
    signupsCurrent,
    signupsPrevious,
    activeCurrent,
    activePrevious,
    sessionsCurrent,
    sessionsPrevious,
    mrrRows,
    funnelRow,
    totals,
  ] = await Promise.all([
    signupDays(db, range.from, range.to),
    signupDays(db, range.prevFrom, range.prevTo),
    activeKidDays(db, range.from, range.to),
    activeKidDays(db, range.prevFrom, range.prevTo),
    sessionSecondsRows(db, range.from, range.to),
    sessionSecondsRows(db, range.prevFrom, range.prevTo),
    sql<MrrRow>`
      select p.handle,
             p.title,
             p.price_eur_month::float8 as price_eur_month,
             count(a.id)::int as accounts
      from platform_plans p
      left join accounts a on a.subscribed_plan = p.handle
      group by p.handle, p.title, p.price_eur_month, p.sort_order
      order by p.sort_order asc
    `
      .execute(db)
      .then((r) => r.rows),
    sql<FunnelRow>`
      select count(*)::int as cohort_accounts,
             count(*) filter (
               where exists (select 1 from kids k where k.account_id = a.id)
             )::int as with_kid,
             count(*) filter (
               where exists (select 1 from game_plays gp where gp.account_id = a.id)
             )::int as with_play,
             count(*) filter (
               where a.model_config->>'voiceProvider' = 'dodi'
                  or a.model_config->>'thinkingProvider' = 'dodi'
                  or a.model_config->>'gameProvider' = 'dodi'
                  or a.model_config->>'imageProvider' = 'dodi'
             )::int as with_dodi_ai
      from accounts a
      where a.created_at >= ${range.from} and a.created_at < ${range.to}
    `
      .execute(db)
      .then((r) => r.rows[0]),
    sql<{
      accounts: number;
      kids: number;
      published_games: number;
      open_publication_requests: number;
      server_errors_in_range: number;
    }>`
      select (select count(*) from accounts)::int as accounts,
             (select count(*) from kids)::int as kids,
             (select count(*) from games
               where published_at is not null or is_system)::int as published_games,
             (select count(*) from games
               where publication_requested_at is not null
                 and published_at is null
                 and rejected_at is null)::int as open_publication_requests,
             (select count(*) from error_logs
               where type = 'server'
                 and created_at >= ${range.from}
                 and created_at < ${range.to})::int as server_errors_in_range
    `
      .execute(db)
      .then((r) => r.rows[0]),
  ]);

  const sum = (rows: DayValueRow[]): number =>
    rows.reduce((total, row) => total + Number(row.value), 0);

  const totalRow = (rows: SessionSecondsRow[]): number | null => {
    const row = rows.find((r) => r.is_total === 1);
    return row?.value === null || row?.value === undefined
      ? null
      : round2(Number(row.value));
  };

  const dailySeconds = (rows: SessionSecondsRow[]): DailyPoint[] =>
    rows
      .filter((r) => r.is_total === 0 && r.day !== null)
      .map((r) => ({ day: r.day as string, value: round2(Number(r.value ?? 0)) }));

  return {
    generatedAt: new Date().toISOString(),
    range,
    totals: {
      accounts: Number(totals?.accounts ?? 0),
      kids: Number(totals?.kids ?? 0),
      publishedGames: Number(totals?.published_games ?? 0),
      openPublicationRequests: Number(totals?.open_publication_requests ?? 0),
      serverErrorsInRange: Number(totals?.server_errors_in_range ?? 0),
    },
    mrr: {
      currentEur: round2(
        mrrRows.reduce(
          (total, row) => total + Number(row.price_eur_month) * Number(row.accounts),
          0,
        ),
      ),
      source: "subscribed_plans",
      byPlan: mrrRows.map((row) => ({
        handle: row.handle,
        title: row.title,
        priceEurMonth: Number(row.price_eur_month),
        accounts: Number(row.accounts),
      })),
    },
    // Fractional on purpose: "average distinct kids per day" over the window,
    // kept to two decimals rather than rounded to whole kids, so a small
    // installation still sees movement between two ranges.
    activeKids: {
      current: round2(sum(activeCurrent) / range.days),
      previous: round2(sum(activePrevious) / range.days),
      daily: fillDays(range, activeCurrent),
    },
    newSignups: {
      current: sum(signupsCurrent),
      previous: sum(signupsPrevious),
      daily: fillDays(range, signupsCurrent),
    },
    avgSessionSeconds: {
      current: totalRow(sessionsCurrent),
      previous: totalRow(sessionsPrevious),
      daily: fillDays(range, dailySeconds(sessionsCurrent)),
    },
    trialToPaid: null,
    churn: null,
    funnel: {
      cohortAccounts: Number(funnelRow?.cohort_accounts ?? 0),
      withKid: Number(funnelRow?.with_kid ?? 0),
      withPlay: Number(funnelRow?.with_play ?? 0),
      withDodiAi: Number(funnelRow?.with_dodi_ai ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/internal/stats/games
// ---------------------------------------------------------------------------

export async function getOpsGameStats(
  db: Db,
  range: OpsRange,
): Promise<OpsGameStatsResponse> {
  const capabilityTags = sql<string[]>`${sql.val([...CAPABILITY_TAGS])}::text[]`;

  const [createdRow, tagRows, publicationRow] = await Promise.all([
    // "Created" counts the parent's own games: not a system game, not a
    // publication copy (a copy duplicates a game already counted here).
    sql<{ total: number; untagged: number; replayed: number }>`
      select count(*)::int as total,
             -- "contained by the capability tags" = carries no subject tag
             -- (an empty tag array is contained by everything).
             count(*) filter (where g.tags <@ ${capabilityTags})::int as untagged,
             count(*) filter (where pl.plays >= 2)::int as replayed
      from games g
      left join lateral (
        select count(*)::int as plays from game_plays p where p.game_id = g.id
      ) pl on true
      where g.is_system = false
        and g.publication_requested_at is null
        and g.created_at >= ${range.from} and g.created_at < ${range.to}
    `
      .execute(db)
      .then((r) => r.rows[0]),
    sql<{ tag: string; count: number }>`
      select t.tag, count(*)::int as count
      from games g
      cross join lateral unnest(g.tags) as t(tag)
      where g.is_system = false
        and g.publication_requested_at is null
        and g.created_at >= ${range.from} and g.created_at < ${range.to}
        and t.tag <> all(${capabilityTags})
      group by t.tag
      order by count(*) desc, t.tag asc
      limit ${TAG_BREAKDOWN_LIMIT}
    `
      .execute(db)
      .then((r) => r.rows),
    sql<{
      pending: number;
      approved_in_range: number;
      rejected_soft_in_range: number;
      rejected_hard_in_range: number;
      parked: number;
    }>`
      select count(*) filter (
               where g.publication_requested_at is not null
                 and g.published_at is null
                 and g.rejected_at is null
             )::int as pending,
             count(*) filter (
               where g.published_at >= ${range.from} and g.published_at < ${range.to}
             )::int as approved_in_range,
             count(*) filter (
               where g.rejection_kind = 'soft'
                 and g.rejected_at >= ${range.from} and g.rejected_at < ${range.to}
             )::int as rejected_soft_in_range,
             count(*) filter (
               where g.rejection_kind = 'hard'
                 and g.rejected_at >= ${range.from} and g.rejected_at < ${range.to}
             )::int as rejected_hard_in_range,
             count(*) filter (
               where g.publication_requested_at is not null
                 and g.published_at is null
                 and g.rejected_at is null
                 and g.review_attempts >= ${PARKED_REVIEW_ATTEMPTS}
             )::int as parked
      from games g
      where g.publication_requested_at is not null
    `
      .execute(db)
      .then((r) => r.rows[0]),
  ]);

  const total = Number(createdRow?.total ?? 0);

  return {
    range,
    created: {
      total,
      byTag: tagRows.map((row) => ({ tag: row.tag, count: Number(row.count) })),
      untagged: Number(createdRow?.untagged ?? 0),
      replayedShare:
        total === 0 ? null : round2(Number(createdRow?.replayed ?? 0) / total),
    },
    publications: {
      pending: Number(publicationRow?.pending ?? 0),
      approvedInRange: Number(publicationRow?.approved_in_range ?? 0),
      rejectedSoftInRange: Number(publicationRow?.rejected_soft_in_range ?? 0),
      rejectedHardInRange: Number(publicationRow?.rejected_hard_in_range ?? 0),
      parked: Number(publicationRow?.parked ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/internal/stats/ai-requests
// ---------------------------------------------------------------------------

/**
 * The account-config key responsible for a usage event. A request is "managed"
 * (served by dodi AI) when the account had `dodi` configured for that category
 * at read time; the ledger itself records the concrete upstream provider, so
 * the category mapping is the only way back to the routing decision.
 */
const RESPONSIBLE_PROVIDER_KEY = sql`
  case
    when l.event_type = 'voice_minutes' then 'voiceProvider'
    when l.event_type in (
      'game_create', 'game_edit', 'game_plan',
      'game_text_generation', 'game_translation'
    ) then 'gameProvider'
    else 'thinkingProvider'
  end
`;

export async function getOpsAiRequestShare(
  db: Db,
  range: OpsRange,
): Promise<OpsAiRequestsResponse> {
  const [providerRows, shareRow] = await Promise.all([
    sql<{ provider: string; requests: number; voice_seconds: number }>`
      select l.provider,
             count(*)::int as requests,
             coalesce(sum(l.voice_seconds), 0)::float8 as voice_seconds
      from ai_usage_logs l
      join accounts a on a.id = l.account_id
      where l.created_at >= ${range.from} and l.created_at < ${range.to}
      group by l.provider
      order by requests desc, l.provider asc
    `
      .execute(db)
      .then((r) => r.rows),
    sql<{ total: number; managed: number }>`
      select count(*)::int as total,
             count(*) filter (
               where a.model_config->>(${RESPONSIBLE_PROVIDER_KEY}) = 'dodi'
             )::int as managed
      from ai_usage_logs l
      join accounts a on a.id = l.account_id
      where l.created_at >= ${range.from} and l.created_at < ${range.to}
    `
      .execute(db)
      .then((r) => r.rows[0]),
  ]);

  const totalRequests = Number(shareRow?.total ?? 0);
  const managedShare =
    totalRequests === 0
      ? null
      : round2(Number(shareRow?.managed ?? 0) / totalRequests);

  return {
    range,
    totalRequests,
    voiceSeconds: round2(
      providerRows.reduce((total, row) => total + Number(row.voice_seconds), 0),
    ),
    byProvider: providerRows.map((row) => ({
      provider: row.provider,
      requests: Number(row.requests),
      voiceSeconds: round2(Number(row.voice_seconds)),
    })),
    managedShare,
    byokShare: managedShare === null ? null : round2(1 - managedShare),
  };
}
