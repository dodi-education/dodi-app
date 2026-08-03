/**
 * The embedded translations block of a game bundle.
 *
 * Every newly generated game carries exactly one inert
 *   <script type="application/dodi-translations">{ sourceLocale, locales }</script>
 * block: a flat key→string dictionary per locale, written by the generation
 * agent (source locale only) and extended at publish time / by the platform's
 * locale backfill. The block is data that happens to travel inside the HTML —
 * a non-JavaScript `type` means browsers never execute it, and keeping it in
 * `code_bundle` means it rides through sealing, versions, exports, snapshots
 * and remixes with no extra fields.
 *
 * At runtime the host-injected sandbox shim parses the block and resolves
 * `dodi.translate(key, params)` against the active locale (from `dodi:init`),
 * falling back per key to the source locale.
 *
 * This module is the single parse/validate/serialize point used by the agent
 * validator, the publish gate, the client publish-translate step and the
 * server-side backfill. It deliberately does NOT depend on @dodi/intl: platform
 * locale *coverage* is the publish gate's concern; this module only guarantees
 * structural validity.
 */
import { z } from "zod/v4";

export const TRANSLATIONS_SCRIPT_TYPE = "application/dodi-translations";

/**
 * Matches one translations block. Global flag so callers can detect duplicate
 * blocks; always reset `lastIndex` (or use via `matchAllTranslationsBlocks`).
 */
const TRANSLATIONS_BLOCK_RE =
  /<script\s+type=["']application\/dodi-translations["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Budgets for the block itself (the 512KB bundle cap applies on top). */
export const MAX_TRANSLATIONS_BLOCK_BYTES = 64 * 1024;
export const MAX_TRANSLATION_KEYS_PER_LOCALE = 400;
export const MAX_TRANSLATION_VALUE_CHARS = 500;

const TRANSLATION_KEY_RE = /^[a-z0-9_.]+$/i;
const LOCALE_CODE_RE = /^[a-z]{2}(-[a-z]{2})?$/i;
// `<` would let a value smuggle markup (or a literal `</script` that terminates
// the inert block during HTML parsing); control chars have no place in UI text.
const FORBIDDEN_VALUE_RE = /[<\u0000-\u001f\u007f]/;

/** Shared guard for a single translation value (also used by AI-output parsing). */
export function isSafeTranslationValue(value: string): boolean {
  return value.length <= MAX_TRANSLATION_VALUE_CHARS && !FORBIDDEN_VALUE_RE.test(value);
}

const TranslationValueSchema = z
  .string()
  .refine(isSafeTranslationValue, {
    message: "translation values must not contain '<' or control characters",
  });

const LocaleDictSchema = z.record(
  z.string().regex(TRANSLATION_KEY_RE, "translation keys must match [a-z0-9_.]+"),
  TranslationValueSchema,
);

export const GameTranslationsSchema = z
  .strictObject({
    sourceLocale: z.string().regex(LOCALE_CODE_RE, "sourceLocale must be a language code like 'de' or 'de-at'"),
    locales: z.record(z.string().regex(LOCALE_CODE_RE), LocaleDictSchema),
  })
  .refine((t) => t.sourceLocale in t.locales, {
    message: "locales must contain an entry for sourceLocale",
  });

export type GameTranslations = z.infer<typeof GameTranslationsSchema>;

function matchTranslationsBlocks(code: string): RegExpMatchArray[] {
  TRANSLATIONS_BLOCK_RE.lastIndex = 0;
  return [...code.matchAll(TRANSLATIONS_BLOCK_RE)];
}

export function hasTranslationsBlock(code: string): boolean {
  return matchTranslationsBlocks(code).length > 0;
}

export interface ExtractedTranslations {
  /** The parsed block, or null when the code carries none or an invalid one. */
  translations: GameTranslations | null;
  /** Agent-actionable problems; empty for both "no block" and "valid block". */
  errors: string[];
}

/**
 * Find and validate the translations block. A missing block is NOT an error
 * here (legacy bundles) — requiring one is the caller's policy (agent
 * validator with `requireTranslations`, publish gate).
 */
export function extractTranslations(code: string): ExtractedTranslations {
  const blocks = matchTranslationsBlocks(code);
  if (blocks.length === 0) return { translations: null, errors: [] };
  if (blocks.length > 1) {
    return {
      translations: null,
      errors: [
        `Found ${blocks.length} <script type="${TRANSLATIONS_SCRIPT_TYPE}"> blocks — a game must contain exactly one.`,
      ],
    };
  }
  const raw = blocks[0][1].trim();
  if (new TextEncoder().encode(raw).length > MAX_TRANSLATIONS_BLOCK_BYTES) {
    return {
      translations: null,
      errors: [
        `The translations block exceeds ${MAX_TRANSLATIONS_BLOCK_BYTES} bytes — shorten or remove strings.`,
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      translations: null,
      errors: [
        `The translations block is not valid JSON. Expected {"sourceLocale":"…","locales":{"…":{"key":"text"}}}.`,
      ],
    };
  }
  const result = GameTranslationsSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return {
      translations: null,
      errors: [`The translations block is malformed: ${details.join("; ")}`],
    };
  }
  const errors: string[] = [];
  for (const [locale, dict] of Object.entries(result.data.locales)) {
    const keyCount = Object.keys(dict).length;
    if (keyCount > MAX_TRANSLATION_KEYS_PER_LOCALE) {
      errors.push(
        `Locale "${locale}" has ${keyCount} keys — the maximum is ${MAX_TRANSLATION_KEYS_PER_LOCALE}.`,
      );
    }
  }
  if (errors.length > 0) return { translations: null, errors };
  return { translations: result.data, errors: [] };
}

/** Render the block, ready to embed. `<` is escaped so no value or key can ever close the tag. */
export function serializeTranslations(translations: GameTranslations): string {
  const json = JSON.stringify(translations, null, 2).replace(/</g, "\\u003c");
  return `<script type="${TRANSLATIONS_SCRIPT_TYPE}">\n${json}\n</script>`;
}

/**
 * Swap the existing block for a re-serialized one, preserving every
 * surrounding byte — the invariant the backfill's executable-code assertion
 * (`codeWithoutTranslationsBlock` equality) relies on. Throws when the code
 * does not contain exactly one block.
 */
export function replaceTranslationsBlock(
  code: string,
  translations: GameTranslations,
): string {
  const blocks = matchTranslationsBlocks(code);
  if (blocks.length !== 1) {
    throw new Error(
      `Cannot replace translations block: expected exactly one, found ${blocks.length}.`,
    );
  }
  const block = blocks[0];
  const start = block.index ?? 0;
  const end = start + block[0].length;
  return code.slice(0, start) + serializeTranslations(translations) + code.slice(end);
}

/** The bundle with every translations block removed — the "executable portion". */
export function codeWithoutTranslationsBlock(code: string): string {
  TRANSLATIONS_BLOCK_RE.lastIndex = 0;
  return code.replace(TRANSLATIONS_BLOCK_RE, "");
}

/**
 * Reduce the block to its source locale only — edit prep before feeding an
 * existing bundle to the model (a published/remixed bundle carries every
 * platform locale; the model only ever writes the source). Bundles without a
 * valid block pass through unchanged.
 */
export function stripTranslationsToSource(code: string): string {
  const { translations } = extractTranslations(code);
  if (!translations) return code;
  const locales = Object.keys(translations.locales);
  // Already source-only: leave the bundle byte-identical (preview-only update
  // paths return the existing code "untouched" and mean it).
  if (locales.length === 1 && locales[0] === translations.sourceLocale) return code;
  const source = translations.locales[translations.sourceLocale] ?? {};
  return replaceTranslationsBlock(code, {
    sourceLocale: translations.sourceLocale,
    locales: { [translations.sourceLocale]: source },
  });
}

const TRANSLATE_CALL_RE = /dodi\.translate\(\s*(["'])([^"'\\]*)\1/g;

/** Unique literal keys passed to `dodi.translate("…")` in the bundle. */
export function translateCallKeys(code: string): string[] {
  TRANSLATE_CALL_RE.lastIndex = 0;
  const keys = new Set<string>();
  for (const match of code.matchAll(TRANSLATE_CALL_RE)) keys.add(match[2]);
  return [...keys];
}

/**
 * Which of `candidates` (locale codes) the block fully covers: an entry
 * exists — exact or short-code match — whose dictionary has every source key.
 * The source locale is covered by definition. Shared by the publish gate, the
 * client translate step, and the locale backfill; candidates come from the
 * caller so this module stays free of the platform locale list.
 */
export function coveredLocales(
  translations: GameTranslations,
  candidates: readonly string[],
): Set<string> {
  const gaps = coverageGaps(translations);
  const covered = new Set<string>();
  for (const key of Object.keys(translations.locales)) {
    if ((gaps[key]?.length ?? 0) > 0) continue;
    const short = key.slice(0, 2).toLowerCase();
    for (const candidate of candidates) {
      if (candidate === key || candidate === short) covered.add(candidate);
    }
  }
  return covered;
}

/**
 * Per-locale keys missing versus the source dictionary. Empty record = every
 * locale fully covers the source key set (the publish-gate condition, checked
 * there against the platform locale list).
 */
export function coverageGaps(
  translations: GameTranslations,
): Record<string, string[]> {
  const sourceKeys = Object.keys(translations.locales[translations.sourceLocale] ?? {});
  const gaps: Record<string, string[]> = {};
  for (const [locale, dict] of Object.entries(translations.locales)) {
    if (locale === translations.sourceLocale) continue;
    const missing = sourceKeys.filter((k) => !(k in dict));
    if (missing.length > 0) gaps[locale] = missing;
  }
  return gaps;
}
