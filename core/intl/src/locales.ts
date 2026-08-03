/**
 * The canonical list of platform locales — the single source of truth shared by
 * the web client's i18n config, the platform's emails, and the game publication
 * gate (published games must carry translations for every locale listed here).
 * Adding a locale here is the switch that turns on the whole pipeline: UI
 * message files, email copy tables (`Record<Locale, …>` compile errors point at
 * the gaps), the publish gate, and the retroactive game-locale backfill.
 */
export const SUPPORTED_LOCALES = ["en", "de"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Map a stored BCP-47 tag (e.g. "en", "de-DE", "DE") onto a supported locale,
 * falling back to {@link DEFAULT_LOCALE} for unknown or missing input.
 */
export function normalizeLocale(input: string | null | undefined): Locale {
  const short = (input ?? "").slice(0, 2).toLowerCase();
  return isSupportedLocale(short) ? short : DEFAULT_LOCALE;
}
