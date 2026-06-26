/**
 * Age / birthday helpers — consolidates the three previously duplicated copies
 * (`calculateChildAge` in core/ai, `ageFromBirthdate` in two parent views).
 *
 * A birthdate is a floating calendar date: it is parsed into year/month/day
 * parts (never via `new Date(...)` against a timezone) and compared to today's
 * local calendar, so it never drifts a day across zones.
 */

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match) {
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }
  // Tolerate other parseable forms (e.g. locale strings) defensively.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** Whole years from `birthdate` to today. `null` for empty/invalid/future. */
export function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const parts = parseYmd(birthdate);
  if (!parts) return null;

  const now = new Date();
  let age = now.getFullYear() - parts.y;
  const monthDiff = now.getMonth() + 1 - parts.m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parts.d)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/** True when today (local calendar) is the month+day of `birthdate`. */
export function isTodayBirthday(birthdate: string | null): boolean {
  if (!birthdate) return false;
  const parts = parseYmd(birthdate);
  if (!parts) return false;
  const now = new Date();
  return now.getMonth() + 1 === parts.m && now.getDate() === parts.d;
}
