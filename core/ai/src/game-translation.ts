/**
 * Prompt + output validation for translating a game into the platform's
 * locales: the bundle's embedded strings (see @dodi/games/translations) plus
 * the listing title/description, all in ONE generation so wording stays
 * coherent. Pure and isomorphic — the publish dialog runs it client-side with
 * the parent's own provider (BYOK), the platform's locale backfill runs it
 * server-side with dodi's own key. Mirrors `game-content.ts`
 * (buildPrompt/strict-parse pair).
 */

import { isSafeTranslationValue } from "@dodi/games/translations";

export interface GameTranslationPromptInput {
  /** Locale code of the language the game is written in (e.g. "de"). */
  sourceLocale: string;
  /** Locale codes to translate INTO (never includes the source). */
  targetLocales: string[];
  /** The bundle's source-locale strings dictionary. */
  strings: Record<string, string>;
  title: string;
  description: string;
}

export interface GameTranslationPrompt {
  system: string;
  prompt: string;
}

/** One locale's translated content, as parsed from the model output. */
export interface TranslatedLocale {
  title: string;
  description: string;
  strings: Record<string, string>;
}

export const MAX_TRANSLATED_TITLE_CHARS = 200;
export const MAX_TRANSLATED_DESCRIPTION_CHARS = 5000;

/**
 * Build the system + user prompt for one multi-locale translation. The word
 * "JSON" must stay in the system prompt (the xAI client requires it for JSON
 * mode).
 */
export function buildGameTranslationPrompt(
  input: GameTranslationPromptInput,
): GameTranslationPrompt {
  const system = [
    "You translate the text of a children's learning game.",
    "The audience is young children: keep wording friendly, simple, and age-appropriate — translate naturally, never word-for-word.",
    "Preserve every {param} placeholder EXACTLY as written — never translate, remove, or add placeholders.",
    "String values are plain text: no HTML, no '<' characters, no line breaks. Keep each translation's length comparable to its source so game layouts still fit.",
    "The title and description describe the game in a public catalog for parents; translate them idiomatically.",
    'Respond with a single JSON object: {"locales": {"<locale>": {"title": "<text>", "description": "<text>", "strings": {"<key>": "<text>", ...}}}} with EXACTLY one entry per requested target locale and EXACTLY the source string keys. No other keys, no markdown, no code fences.',
  ].join("\n");

  const prompt = [
    `## Source language: ${input.sourceLocale}`,
    `Title: ${input.title}`,
    `Description: ${input.description || "(none)"}`,
    "",
    "## Source strings",
    JSON.stringify(input.strings, null, 2),
    "",
    `## Translate into: ${input.targetLocales.join(", ")}`,
  ].join("\n");

  return { system, prompt };
}

function placeholdersOf(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[0]);
}

/**
 * Validate a `generateJson` result. Strict, all-or-nothing: every target
 * locale present, every locale carrying a non-empty title and EXACTLY the
 * source key set, every value passing the same guard the bundle block
 * enforces, and every {param} placeholder of a source value preserved in its
 * translation. Throws on any violation — a game must never be half-translated.
 */
export function parseGeneratedTranslations(
  raw: Record<string, unknown>,
  input: { targetLocales: string[]; sourceStrings: Record<string, string> },
): Record<string, TranslatedLocale> {
  const rawLocales = raw.locales;
  if (!rawLocales || typeof rawLocales !== "object" || Array.isArray(rawLocales)) {
    throw new Error("Generated translations have no locales object");
  }
  const source = rawLocales as Record<string, unknown>;
  const expectedKeys = Object.keys(input.sourceStrings);
  const result: Record<string, TranslatedLocale> = {};

  for (const locale of input.targetLocales) {
    const entry = source[locale];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Generated translations are missing locale '${locale}'`);
    }
    const record = entry as Record<string, unknown>;

    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) throw new Error(`Generated translations for '${locale}' have no title`);

    const description =
      typeof record.description === "string" ? record.description.trim() : "";

    const rawStrings = record.strings;
    if (
      expectedKeys.length > 0 &&
      (!rawStrings || typeof rawStrings !== "object" || Array.isArray(rawStrings))
    ) {
      throw new Error(`Generated translations for '${locale}' have no strings object`);
    }
    const stringsSource = (rawStrings ?? {}) as Record<string, unknown>;
    const strings: Record<string, string> = {};
    for (const key of expectedKeys) {
      const value = stringsSource[key];
      const text = typeof value === "string" ? value : "";
      if (!text) {
        throw new Error(`Generated translations for '${locale}' are missing key '${key}'`);
      }
      if (!isSafeTranslationValue(text)) {
        throw new Error(
          `Generated translation for '${locale}'.'${key}' contains markup or control characters`,
        );
      }
      for (const placeholder of placeholdersOf(input.sourceStrings[key])) {
        if (!text.includes(placeholder)) {
          throw new Error(
            `Generated translation for '${locale}'.'${key}' dropped the ${placeholder} placeholder`,
          );
        }
      }
      strings[key] = text;
    }

    result[locale] = {
      title: title.slice(0, MAX_TRANSLATED_TITLE_CHARS),
      description: description.slice(0, MAX_TRANSLATED_DESCRIPTION_CHARS),
      strings,
    };
  }
  return result;
}
