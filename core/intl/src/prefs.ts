/**
 * Date/time display preferences and their resolution.
 *
 * A preference has three independent parts: the IANA `timeZone` (or `"auto"` to
 * use the runtime/browser zone), a `dateStyle` (numeric vs long), and a
 * `timeStyle` (24h / 12h / no time). Each part resolves independently down the
 * chain kid → account → context default, so a kid can override only the
 * timezone while inheriting the rest.
 *
 * Context-aware defaults: the parent/account area defaults to the compact
 * numeric form, while kids default to the more readable long form.
 * Locale drives the numeric ordering automatically (`de` → 24.06.2026,
 * `en` → 06/24/2026) and the default time style (DE 24h, EN 12h).
 */

/**
 * Selectable date orderings. `"numeric"` follows the locale's own short format;
 * `"long"` is the localized long form (month name). The rest are explicit,
 * language-independent patterns (the separator/order is fixed regardless of
 * locale) so e.g. an English-speaking parent can choose `DD.MM.YYYY`.
 */
export const DATE_STYLE_IDS = [
  "numeric",
  "dmy_slash",
  "mdy_slash",
  "dmy_dot",
  "ymd_dash",
  "long",
] as const;
export type DateStyleId = (typeof DATE_STYLE_IDS)[number];

export type TimeStyleId = "24h" | "12h" | "none";

export interface DateFormatPref {
  /** IANA timezone id, or `"auto"` to use the runtime/browser zone. */
  timeZone: string;
  dateStyle: DateStyleId;
  timeStyle: TimeStyleId;
}

/** A sparse, in-memory preference (any field may be unset and fall through). */
export type PartialDateFormatPref = Partial<DateFormatPref>;

/** Which area is rendering — selects the default `dateStyle`. */
export type FormatContext = "account" | "kid";

/**
 * On-disk shape of the `date_preferences` jsonb column on `accounts`/`kids`.
 * The timezone is sealed (`enc:v1:`) when explicitly set; absent ⇒ `"auto"`,
 * which leaks nothing to the server. Date/time styles are innocuous plaintext.
 */
export interface StoredDatePreferences {
  dateStyle?: DateStyleId;
  timeStyle?: TimeStyleId;
  /** `enc:v1:` sealed IANA timezone; `null`/absent ⇒ automatic. */
  timeZoneEnc?: string | null;
}

function isGerman(locale: string): boolean {
  return locale.toLowerCase().startsWith("de");
}

/** The baseline preference for a locale + rendering context. */
export function defaultPref(locale: string, context: FormatContext): DateFormatPref {
  return {
    timeZone: "auto",
    dateStyle: context === "kid" ? "long" : "numeric",
    timeStyle: isGerman(locale) ? "24h" : "12h",
  };
}

/**
 * Merge kid over account over the context default, per field. Absent fields
 * (`undefined`) fall through; an explicitly set value always wins at its level.
 */
export function resolvePref(
  locale: string,
  context: FormatContext,
  account?: PartialDateFormatPref | null,
  kid?: PartialDateFormatPref | null,
): DateFormatPref {
  const base = defaultPref(locale, context);
  return {
    timeZone: kid?.timeZone ?? account?.timeZone ?? base.timeZone,
    dateStyle: kid?.dateStyle ?? account?.dateStyle ?? base.dateStyle,
    timeStyle: kid?.timeStyle ?? account?.timeStyle ?? base.timeStyle,
  };
}
