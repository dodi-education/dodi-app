/**
 * Retroactive game-locale backfill: when the platform gains a language,
 * already-published games are missing it — this walks LIVE published rows
 * whose `available_locales` lag `SUPPORTED_LOCALES` and fills the gap with
 * dodi's own AI (the SECURITY_AGENT_* config — never a parent's key).
 *
 * The one mutation is APPEND-ONLY TEXT: the bundle's inert
 * `application/dodi-translations` block gains locales and the listing gains
 * `game_translations` rows. The executable code must stay byte-identical —
 * asserted via `codeWithoutTranslationsBlock` equality before any write — so
 * editing reviewed published rows in place never invalidates their review.
 *
 * Modeled on `processPendingPublications`: serial batch, fail-closed per item,
 * one structured summary per run. Ops-triggered only (no cron): see
 * /api/internal/jobs/backfill-game-locales.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildGameTranslationPrompt,
  parseGeneratedTranslations,
} from "@dodi/ai/game-translation";
import { createThinkingProvider } from "@dodi/ai/thinking-providers/factory";
import {
  codeWithoutTranslationsBlock,
  coveredLocales,
  extractTranslations,
  replaceTranslationsBlock,
} from "@dodi/games/translations";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import type { Database, Game } from "@dodi/types/database";
import { sanitizeGameBundle } from "../game-sanitizer";

import { logServerError } from "@/lib/error-logs";

import { listTranslations } from "./game-translations";
import { loadReviewAgentConfig } from "./publication-review";

type Client = SupabaseClient<Database>;

const BACKFILL_BATCH_LIMIT = 5;
/** Candidate scan window — plenty while the catalog is young; raise when it isn't. */
const CANDIDATE_SCAN_LIMIT = 500;

/**
 * LIVE published rows missing at least one platform locale, oldest first.
 * PostgREST cannot express "does not contain ALL of […]" cleanly, so this
 * scans a bounded window and filters here — fine at ops scale.
 */
export async function listPublishedGamesNeedingLocales(
  supabase: Client,
  limit: number,
): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (error) throw error;
  return ((data ?? []) as unknown as Game[])
    .filter((game) => {
      const locales = game.available_locales;
      return !locales || SUPPORTED_LOCALES.some((l) => !locales.includes(l));
    })
    .slice(0, limit);
}

export interface DryRunDetail {
  id: string;
  missingLocales: string[];
  wouldGrowBytes: number;
}

export interface BackfillRunResult {
  /** True when the agent config (SECURITY_AGENT_*) is absent — nothing ran. */
  disabled: boolean;
  /** True when this run computed everything but wrote nothing. */
  dryRun: boolean;
  /** Candidates picked up this run. */
  processed: number;
  /** Rows whose bundle/listing/available_locales were (or would be) updated. */
  updated: number;
  /** Published rows without a translations block (system/legacy) — nothing to do. */
  skippedNoBlock: number;
  /** Rows whose merged bundle would overflow the stored size cap. */
  skippedTooLarge: number;
  /** Agent/validation failures — the row is left untouched for the next run. */
  errors: number;
  /** Per-game preview, dry runs only. */
  details: DryRunDetail[];
}

/**
 * One backfill run over up to `limit` published games. Serial on purpose —
 * a batch bounds spend, and backfill latency is measured in ops runs.
 */
export async function backfillGameLocales(
  supabase: Client,
  options: {
    limit?: number;
    dryRun?: boolean;
    /** Test seam — defaults to the real provider factory. */
    providerFactory?: typeof createThinkingProvider;
  } = {},
): Promise<BackfillRunResult> {
  const limit = options.limit ?? BACKFILL_BATCH_LIMIT;
  const dryRun = options.dryRun ?? false;
  const factory = options.providerFactory ?? createThinkingProvider;
  const result: BackfillRunResult = {
    disabled: false,
    dryRun,
    processed: 0,
    updated: 0,
    skippedNoBlock: 0,
    skippedTooLarge: 0,
    errors: 0,
    details: [],
  };

  const config = loadReviewAgentConfig();
  if (!config) {
    result.disabled = true;
    return result;
  }

  const candidates = await listPublishedGamesNeedingLocales(supabase, limit);

  for (const game of candidates) {
    result.processed += 1;

    const { translations: block } = extractTranslations(game.code_bundle);
    if (!block) {
      result.skippedNoBlock += 1;
      continue;
    }

    try {
      // A locale needs work when the block misses it OR its listing row is
      // absent; targets are re-translated wholesale so both stay coherent.
      const covered = coveredLocales(block, SUPPORTED_LOCALES);
      const listingRows = await listTranslations(supabase, game.id);
      const listingLocales = new Set(listingRows.map((row) => row.locale));
      const targets = SUPPORTED_LOCALES.filter(
        (locale) => !covered.has(locale) || !listingLocales.has(locale),
      );

      if (targets.length === 0) {
        // Fully covered already — only the derived column lags.
        if (!dryRun) {
          const { error } = await supabase
            .from("games")
            .update({ available_locales: [...SUPPORTED_LOCALES] })
            .eq("id", game.id);
          if (error) throw error;
        }
        result.updated += 1;
        continue;
      }

      const sourceStrings = block.locales[block.sourceLocale] ?? {};
      const { system, prompt } = buildGameTranslationPrompt({
        sourceLocale: block.sourceLocale,
        targetLocales: targets,
        strings: sourceStrings,
        title: game.title,
        description: game.description,
      });
      const provider = factory(config.provider, config.apiKey, config.model);
      const raw = await provider.generateJson(system, prompt);
      const translated = parseGeneratedTranslations(raw, {
        targetLocales: targets,
        sourceStrings,
      });

      const mergedLocales = { ...block.locales };
      for (const locale of targets) {
        mergedLocales[locale] = translated[locale].strings;
      }
      const nextBundle = replaceTranslationsBlock(game.code_bundle, {
        sourceLocale: block.sourceLocale,
        locales: mergedLocales,
      });

      // The invariant that makes in-place edits of reviewed rows safe: only
      // the inert block may differ. Refuse the write on any other change.
      if (
        codeWithoutTranslationsBlock(nextBundle) !==
        codeWithoutTranslationsBlock(game.code_bundle)
      ) {
        throw new Error("executable code changed during locale backfill");
      }

      let sanitized: string;
      try {
        sanitized = sanitizeGameBundle(nextBundle).code;
      } catch (error) {
        if (error instanceof Error && /maximum size/i.test(error.message)) {
          result.skippedTooLarge += 1;
          continue;
        }
        throw error;
      }

      if (dryRun) {
        result.details.push({
          id: game.id,
          missingLocales: targets,
          wouldGrowBytes: nextBundle.length - game.code_bundle.length,
        });
        result.updated += 1;
        continue;
      }

      // Listing rows first, the game row (with available_locales) last — the
      // derived column is the "done" marker, so a partial failure re-queues.
      const newListingRows = targets
        .filter((locale) => !listingLocales.has(locale))
        .map((locale) => ({
          game_id: game.id,
          locale,
          title: translated[locale].title,
          description: translated[locale].description,
        }));
      if (newListingRows.length > 0) {
        const { error } = await supabase
          .from("game_translations")
          .insert(newListingRows);
        if (error) throw error;
      }
      const { error: updateError } = await supabase
        .from("games")
        .update({
          code_bundle: sanitized,
          available_locales: [...SUPPORTED_LOCALES],
        })
        .eq("id", game.id);
      if (updateError) throw updateError;

      result.updated += 1;
    } catch (error) {
      // Fail closed per item: leave the row untouched for the next run.
      logServerError("services/game-locale-backfill#item", error);
      result.errors += 1;
    }
  }

  return result;
}
