/**
 * Client-side publish-translate step (E2EE/BYOK). Publishing requires the game
 * to cover EVERY platform locale: this resolves the vault-held thinking
 * provider/key, translates the bundle's embedded strings plus the listing
 * title/description in one generation directly from the browser (the server
 * never sees the key), re-embeds the merged translations block, and returns
 * the payload pieces the publication POST needs.
 *
 * The parent pays for these tokens, so paid work is skipped per locale: string
 * dictionaries the bundle already carries (the publish dialog persists the
 * translated bundle back into the sealed SOURCE game) and listing texts the
 * caller already knows (an existing publication's rows) are reused. When only
 * listing texts are missing, a strings-free mini generation runs instead of a
 * full one. Mirrors `client-generate-text.ts`.
 */
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import {
  buildGameTranslationPrompt,
  parseGeneratedTranslations,
} from "@dodi/ai/game-translation";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import {
  coveredLocales,
  extractTranslations,
  replaceTranslationsBlock,
} from "@dodi/games/translations";
import { SUPPORTED_LOCALES, normalizeLocale } from "@dodi/intl/locales";
import { NoThinkingModelError } from "@/lib/ai/client-generate-text";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { reportUsage } from "@/lib/usage/report-usage";
import type { Game } from "@dodi/types/database";

/** The game predates the translations contract — rebuild it in the studio first. */
export class MissingTranslationsError extends Error {
  constructor() {
    super("Game bundle has no translations block");
    this.name = "MissingTranslationsError";
  }
}

/** The translated bundle exceeds the stored size cap. */
export class BundleTooLargeError extends Error {
  constructor() {
    super("Translated game bundle exceeds the size limit");
    this.name = "BundleTooLargeError";
  }
}

export interface ListingText {
  title: string;
  description: string;
}

export interface PublicationTranslationResult {
  /** The game's own (platform-normalized) locale — its entry mirrors title/description. */
  sourceLocale: string;
  /** The bundle with the translations block covering every platform locale. */
  codeBundle: string;
  /** Per-locale listing content, INCLUDING the source locale's own entry. */
  translations: Record<string, ListingText>;
}

/**
 * Translate a decrypted game into every platform locale for publication.
 * Throws {@link MissingTranslationsError} for pre-i18n games,
 * {@link NoThinkingModelError} without a configured thinking model, and
 * {@link BundleTooLargeError} when the merged bundle overflows the cap.
 * When nothing is missing, no AI call happens and `codeBundle` comes back
 * unchanged — the caller persists it to the source game only when it differs.
 */
export async function translateGameForPublication(
  game: Game,
  options: {
    /** Listing texts already known (an existing publication's rows). */
    knownListings?: Record<string, ListingText>;
  } = {},
): Promise<PublicationTranslationResult> {
  const { translations, errors } = extractTranslations(game.code_bundle);
  if (!translations) {
    if (errors.length > 0) throw new Error(errors.join(" "));
    throw new MissingTranslationsError();
  }

  const sourceLocale = normalizeLocale(translations.sourceLocale);
  const sourceStrings = translations.locales[translations.sourceLocale] ?? {};
  const known = options.knownListings ?? {};
  const covered = coveredLocales(translations, SUPPORTED_LOCALES);
  const nonSource = SUPPORTED_LOCALES.filter((locale) => locale !== sourceLocale);

  // Paid work per locale: strings when the bundle doesn't cover it yet,
  // listing when the caller knows no title for it.
  const stringsTargets = nonSource.filter((locale) => !covered.has(locale));
  const aiTargets = nonSource.filter(
    (locale) => !covered.has(locale) || !known[locale]?.title.trim(),
  );

  const result: PublicationTranslationResult = {
    sourceLocale,
    codeBundle: game.code_bundle,
    translations: {
      [sourceLocale]: { title: game.title, description: game.description },
    },
  };
  for (const locale of nonSource) {
    const listing = known[locale];
    if (listing?.title.trim()) result.translations[locale] = listing;
  }
  if (aiTargets.length === 0) return result;

  const thinking = await resolveClientThinking();
  if (!thinking) throw new NoThinkingModelError();

  // Strings-free mini call when only listing texts are missing (the bundle
  // already carries every locale's dictionary — e.g. a re-publish).
  const includeStrings = stringsTargets.length > 0;
  const promptStrings = includeStrings ? sourceStrings : {};

  const provider = createClientThinkingProvider(
    thinking.provider,
    thinking.apiKey,
    thinking.model,
    (usage) =>
      reportUsage({
        eventType: "game_translation",
        gameId: game.id,
        provider: thinking.provider,
        model: thinking.model,
        usage,
        meta: {
          promptChars: JSON.stringify(promptStrings).length,
        },
      }),
  );

  const { system, prompt } = buildGameTranslationPrompt({
    sourceLocale: translations.sourceLocale,
    targetLocales: [...aiTargets],
    strings: promptStrings,
    title: game.title,
    description: game.description,
  });
  const raw = await provider.generateJson(system, prompt);
  const translated = parseGeneratedTranslations(raw, {
    targetLocales: [...aiTargets],
    sourceStrings: promptStrings,
  });

  for (const locale of aiTargets) {
    result.translations[locale] = {
      title: translated[locale].title,
      description: translated[locale].description,
    };
  }

  if (includeStrings) {
    const mergedLocales = { ...translations.locales };
    for (const locale of aiTargets) {
      mergedLocales[locale] = translated[locale].strings;
    }
    const codeBundle = replaceTranslationsBlock(game.code_bundle, {
      sourceLocale: translations.sourceLocale,
      locales: mergedLocales,
    });

    // Surface cap/pattern problems here, before any network call, with a
    // typed error the dialog can translate into parent-facing copy.
    try {
      result.codeBundle = sanitizeGameBundle(codeBundle).code;
    } catch (error) {
      if (error instanceof Error && /maximum size/i.test(error.message)) {
        throw new BundleTooLargeError();
      }
      throw error;
    }
  }
  return result;
}
