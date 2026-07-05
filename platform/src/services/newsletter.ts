import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";

import type { EmailLocale } from "@/emails/strings";

type Client = SupabaseClient<Database>;

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
 * Record a newsletter signup via the record_newsletter_signup RPC, which
 * enforces the per-IP rate limit and per-list dedupe atomically. Requires a
 * service-role client (the function is revoked from anon/authenticated). Throws
 * on DB error.
 */
export async function recordNewsletterSignup(
  supabase: Client,
  input: NewsletterSubmission,
): Promise<NewsletterResult> {
  const { data, error } = await supabase.rpc("record_newsletter_signup", {
    p_email: input.email,
    p_locale: input.locale,
    p_list: input.list,
    p_ip_hash: input.ipHash,
    p_max_per_ip: input.maxPerIp,
    p_window: input.window,
  });
  if (error) throw new Error(error.message);

  // The function RETURNS TABLE(...) → PostgREST returns a one-element array.
  const row = data?.[0];
  if (!row) throw new Error("record_newsletter_signup returned no row");

  return { isNew: row.is_new, rateLimited: row.rate_limited, id: row.id };
}
