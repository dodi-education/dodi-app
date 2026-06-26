/**
 * Pure, locale- and timezone-aware date/time formatters built on the native
 * `Intl.DateTimeFormat`. The single source of truth for how dates render in the
 * app — every call-site formats through these instead of ad-hoc `toLocaleString`
 * / `Intl.DateTimeFormat` calls.
 *
 * `"numeric"` and `"long"` defer ordering/separators to the locale. The explicit
 * styles (e.g. `dmy_dot`) are assembled from `Intl.formatToParts()` so the order
 * and separator are fixed independent of language, while the day/month/year
 * values still come from a timezone-correct Intl format.
 */
import type { DateFormatPref, DateStyleId, TimeStyleId } from "./prefs";

export interface FmtCtx {
  locale: string;
  pref: DateFormatPref;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `"auto"` ⇒ `undefined`, which lets Intl use the runtime/browser zone. */
function zoneOf(pref: DateFormatPref): string | undefined {
  return pref.timeZone === "auto" ? undefined : pref.timeZone;
}

function dateOptions(style: DateStyleId): Intl.DateTimeFormatOptions {
  return style === "long"
    ? { day: "numeric", month: "long", year: "numeric" } // June 24, 2026 / 24. Juni 2026
    : { day: "2-digit", month: "2-digit", year: "numeric" }; // locale-ordered numeric
}

function timeOptions(style: TimeStyleId): Intl.DateTimeFormatOptions | null {
  if (style === "none") return null;
  return { hour: "2-digit", minute: "2-digit", hour12: style === "12h" };
}

// Explicit, language-independent date patterns. Order + separator are fixed; the
// day/month/year values are produced timezone-correctly per call.
const EXPLICIT_PATTERNS: Partial<
  Record<DateStyleId, (p: { day: string; month: string; year: string }) => string>
> = {
  dmy_slash: (p) => `${p.day}/${p.month}/${p.year}`,
  mdy_slash: (p) => `${p.month}/${p.day}/${p.year}`,
  dmy_dot: (p) => `${p.day}.${p.month}.${p.year}`,
  ymd_dash: (p) => `${p.year}-${p.month}-${p.day}`,
};

/** Day/month/year as fixed-width Latin digits in the given zone (for explicit patterns). */
function dateParts(
  date: Date,
  timeZone: string | undefined,
): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** The date portion only, honoring style + zone. */
function datePortion(
  date: Date,
  locale: string,
  timeZone: string | undefined,
  style: DateStyleId,
): string {
  const explicit = EXPLICIT_PATTERNS[style];
  if (explicit) return explicit(dateParts(date, timeZone));
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(style),
    timeZone,
  }).format(date);
}

function timePortion(
  date: Date,
  locale: string,
  timeZone: string | undefined,
  style: TimeStyleId,
): string {
  const opt = timeOptions(style) ?? { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat(locale, { ...opt, timeZone }).format(date);
}

/** Date + time in the preferred style and zone. Empty string for invalid input. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  ctx: FmtCtx,
): string {
  const date = toDate(value);
  if (!date) return "";
  const { locale, pref } = ctx;
  const zone = zoneOf(pref);

  // Explicit patterns are assembled, then time is appended (locale-joined).
  if (EXPLICIT_PATTERNS[pref.dateStyle]) {
    const datePart = datePortion(date, locale, zone, pref.dateStyle);
    if (pref.timeStyle === "none") return datePart;
    return `${datePart}, ${timePortion(date, locale, zone, pref.timeStyle)}`;
  }

  // numeric / long: one Intl call so the date↔time join stays locale-correct.
  const time = timeOptions(pref.timeStyle);
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(pref.dateStyle),
    ...(time ?? {}),
    timeZone: zone,
  }).format(date);
}

/** Date only (no time), honoring style + zone. Empty string for invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  ctx: FmtCtx,
): string {
  const date = toDate(value);
  if (!date) return "";
  return datePortion(date, ctx.locale, zoneOf(ctx.pref), ctx.pref.dateStyle);
}

/** Time only, honoring style + zone. Empty string for invalid input. */
export function formatTime(
  value: string | number | Date | null | undefined,
  ctx: FmtCtx,
): string {
  const date = toDate(value);
  if (!date) return "";
  return timePortion(date, ctx.locale, zoneOf(ctx.pref), ctx.pref.timeStyle);
}

/**
 * Format a date-only value (e.g. a birthdate) as a floating calendar date.
 *
 * A bare `YYYY-MM-DD` (or the date portion of an ISO timestamp) is read as
 * authored and rendered in UTC, so a negative-offset display zone never shifts
 * the calendar day — the long-standing birthdate bug. Returns `null` (not "")
 * so call-sites can choose whether to render at all. Ignores timezone/time.
 */
export function formatDateOnly(
  value: string | null | undefined,
  ctx: { locale: string; dateStyle: DateStyleId },
): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return datePortion(date, ctx.locale, "UTC", ctx.dateStyle);
}

/**
 * Short elapsed duration between two instants ("45s", "3m 12s"). `endIso` of
 * `null` means "now" (for in-progress durations). Replaces the duplicated
 * `formatElapsed` helpers in the parent dashboard and agent-sessions views.
 */
export function formatElapsed(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
