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

/** A typeable date input's field order + separator (numeric form). */
export type DateFieldPart = "day" | "month" | "year";
export interface DateFieldMask {
  order: DateFieldPart[];
  separator: string;
}

// Distinct day/month so the locale-derived field order is unambiguous.
const MASK_SAMPLE = new Date(Date.UTC(2026, 5, 24)); // 24 Jun 2026

const EXPLICIT_MASKS: Partial<Record<DateStyleId, DateFieldMask>> = {
  dmy_slash: { order: ["day", "month", "year"], separator: "/" },
  mdy_slash: { order: ["month", "day", "year"], separator: "/" },
  dmy_dot: { order: ["day", "month", "year"], separator: "." },
  ymd_dash: { order: ["year", "month", "day"], separator: "-" },
};

/**
 * The numeric field order + separator to use for a *typeable* date input.
 * Explicit styles are fixed; `numeric`/`long` derive both from the locale's own
 * short numeric format (`de` → DD.MM.YYYY, `en` → MM/DD/YYYY). `long` isn't
 * typeable, so it falls back to the locale's numeric ordering.
 */
export function dateFieldMask(locale: string, dateStyle: DateStyleId): DateFieldMask {
  const explicit = EXPLICIT_MASKS[dateStyle];
  if (explicit) return explicit;
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(MASK_SAMPLE);
  const order: DateFieldPart[] = [];
  let separator = "";
  for (const p of parts) {
    if (p.type === "day" || p.type === "month" || p.type === "year") {
      order.push(p.type);
    } else if (p.type === "literal" && !separator) {
      const ch = p.value.trim();
      if (ch) separator = ch[0];
    }
  }
  if (order.length !== 3) return { order: ["year", "month", "day"], separator: "-" };
  return { order, separator: separator || "/" };
}

/** The format hint for a date input (e.g. `DD.MM.YYYY`). */
export function dateFieldPlaceholder(mask: DateFieldMask): string {
  const label: Record<DateFieldPart, string> = { day: "DD", month: "MM", year: "YYYY" };
  return mask.order.map((f) => label[f]).join(mask.separator);
}

/** Format a canonical `YYYY-MM-DD` into the masked numeric string; `""` if empty/invalid. */
export function formatDateField(iso: string | null | undefined, mask: DateFieldMask): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return "";
  const vals: Record<DateFieldPart, string> = { year: m[1], month: m[2], day: m[3] };
  return mask.order.map((f) => vals[f]).join(mask.separator);
}

/**
 * Parse a typed date into a canonical `YYYY-MM-DD` using `mask`'s field order.
 * Separator-agnostic (any non-digit runs delimit the three groups). Returns
 * `null` unless the input is a complete, real calendar date with a 4-digit year.
 */
export function parseDateField(text: string, mask: DateFieldMask): string | null {
  const groups = text.match(/\d+/g);
  if (!groups || groups.length !== 3) return null;
  const vals = {} as Record<DateFieldPart, string>;
  mask.order.forEach((f, i) => (vals[f] = groups[i]));
  if (vals.year.length !== 4) return null; // require an explicit 4-digit year
  const year = Number(vals.year);
  const month = Number(vals.month);
  const day = Number(vals.day);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject overflow (e.g. 31 Feb silently rolling into March).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${vals.year}-${pad(month)}-${pad(day)}`;
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
