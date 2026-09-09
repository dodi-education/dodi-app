import { sql } from "kysely";

import type { EmailLocale } from "@/emails/strings";
import type { Db } from "@/lib/db";

/** Fallback list used when NEWSLETTER_LISTS is unset (the general newsletter). */
const DEFAULT_LISTS = ["newsletter"] as const;

/**
 * The set of newsletter lists a form may bind to, from the NEWSLETTER_LISTS env
 * (comma-separated). Unset/empty falls back to the default "newsletter" list,
 * mirroring the validate-with-fallback style of getRegistrationMode(). Read
 * server-side only.
 */
export function getNewsletterLists(): string[] {
  const parsed = (process.env.NEWSLETTER_LISTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_LISTS];
}

/** Whether `list` is one of the configured newsletter lists. */
export function isValidNewsletterList(list: string): boolean {
  return getNewsletterLists().includes(list);
}

export interface NewsletterSubmission {
  /** Already normalized (trimmed + lowercased) by the caller. */
  email: string;
  locale: EmailLocale;
  /** The newsletter list, already validated against getNewsletterLists(). */
  list: string;
  /** HMAC of the client IP (see lib/client-ip). Null skips the per-IP limit. */
  ipHash: string | null;
  /** Per-IP cap within the window. */
  maxPerIp: number;
  /** Postgres interval string, e.g. "01:00:00". */
  window: string;
}

export interface NewsletterResult {
  /** True when a new row was created; false for a deduped (existing) email. */
  isNew: boolean;
  /** True when the per-IP cap was hit — nothing was stored. */
  rateLimited: boolean;
  /** The signup id, or null when rate-limited. */
  id: string | null;
}

/**
 * Record a newsletter signup via the record_newsletter_signup SQL function,
 * which enforces the per-IP rate limit and per-list dedupe atomically. Requires
 * the service db (the function is granted to dodi_service only). Throws on DB
 * error.
 */
export async function recordNewsletterSignup(
  db: Db,
  input: NewsletterSubmission,
): Promise<NewsletterResult> {
  const { rows } = await sql<{
    id: string | null;
    is_new: boolean;
    rate_limited: boolean;
  }>`
    select * from public.record_newsletter_signup(
      ${input.email},
      ${input.locale},
      ${input.list},
      ${input.ipHash},
      ${input.maxPerIp}::integer,
      ${input.window}::interval
    )
  `.execute(db);

  // The function RETURNS TABLE(...): exactly one row.
  const row = rows[0];
  if (!row) throw new Error("record_newsletter_signup returned no row");

  return { isNew: row.is_new, rateLimited: row.rate_limited, id: row.id };
}
