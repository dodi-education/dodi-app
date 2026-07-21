/**
 * Rules for `accounts.publication_handle` — the PUBLIC author byline shown on a
 * game published to dodi Discover (e.g. "fun_games").
 *
 * It exists because every human-readable name in dodi is end-to-end encrypted:
 * a kid's `display_name` and a persona's `name` are sealed under the account
 * VMK, and `accounts.email` is never publishable. So a listing that says "by …"
 * needs a name the parent deliberately chose FOR publication — the same
 * reasoning that makes `kids.social_id` a random public handle while the real
 * name stays sealed.
 *
 * Handles are canonically lowercase (the client lowercases typed input, the way
 * social codes are uppercased) so uniqueness is unambiguous. The character set
 * matches the DB CHECK constraint on the column, and both are enforced.
 */

/** Must match the `accounts_publication_handle_format_check` CHECK constraint. */
export const PUBLICATION_HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export const PUBLICATION_HANDLE_MIN_LENGTH = 3;
export const PUBLICATION_HANDLE_MAX_LENGTH = 30;

/**
 * Handles that would let a listing impersonate dodi itself or a staff account.
 * Compared after normalization.
 */
export const RESERVED_PUBLICATION_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "dodi",
  "help",
  "moderator",
  "official",
  "root",
  "staff",
  "support",
  "system",
]);

/** Trim and lowercase; the canonical form that is stored and compared. */
export function normalizePublicationHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Whether a handle is acceptable. Expects an already-normalized value — an
 * un-normalized one (spaces, uppercase) correctly fails the pattern, which is
 * what the live form validation wants to surface.
 */
export function isValidPublicationHandle(handle: string): boolean {
  return (
    PUBLICATION_HANDLE_RE.test(handle) &&
    !RESERVED_PUBLICATION_HANDLES.has(handle)
  );
}

/** Why a handle was rejected, for form messaging. `null` = it is valid. */
export type PublicationHandleError = "format" | "reserved";

export function publicationHandleError(
  handle: string,
): PublicationHandleError | null {
  if (!PUBLICATION_HANDLE_RE.test(handle)) return "format";
  if (RESERVED_PUBLICATION_HANDLES.has(handle)) return "reserved";
  return null;
}
