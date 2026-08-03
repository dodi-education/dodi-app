/**
 * The rejection taxonomy for the dodi Discover review harness — the single
 * registry every consumer maps against: the security agent's prompt and verdict
 * schema (platform), the `games.rejection_reasons` column shape, the operator
 * rejection email, and the parent-facing publish dialog (web, via i18n keys
 * `publishReason_<code>`).
 *
 * Two kinds, encoded in the code's prefix (PROJECT.md "rejection type"):
 *   hard — permanent: the source game can never be resubmitted and the account
 *          is flagged for review (`accounts.flagged_for_review_at`).
 *   soft — demand changes: the parent sees the reasons, fixes the game, and
 *          may resubmit (each resubmit consumes monthly quota).
 */

export const HARD_REJECTION_CODES = [
  "hard_security_violation",
  "hard_forbidden_content",
  "hard_child_safety",
  "hard_copyright_infringement",
] as const;

export const SOFT_REJECTION_CODES = [
  "soft_contains_personal_information",
  "soft_bridge_protocol_mismatch",
  "soft_age_appropriateness",
  "soft_misleading_metadata",
  "soft_quality_below_bar",
  "soft_advertising_or_promotion",
  "soft_translation_quality",
] as const;

export const REJECTION_CODES = [
  ...HARD_REJECTION_CODES,
  ...SOFT_REJECTION_CODES,
] as const;

export type HardRejectionCode = (typeof HARD_REJECTION_CODES)[number];
export type SoftRejectionCode = (typeof SOFT_REJECTION_CODES)[number];
export type RejectionCode = (typeof REJECTION_CODES)[number];

/** Mirrors the `games.rejection_kind` / `game_publication_requests.rejection_kind` CHECK. */
export type RejectionKind = "hard" | "soft";

/** One entry of the `rejection_reasons` jsonb array. */
export interface PublicationRejectionReason {
  code: RejectionCode;
  /** The agent's plain-text explanation, written to be parent-actionable. */
  note: string;
}

/**
 * The review criteria per code, phrased as instructions to the security agent.
 * The agent prompt is rendered FROM this record, so prompt and registry cannot
 * drift. English only — this is operator/agent-facing; the parent-facing labels
 * live in the web i18n catalogs.
 */
export const REJECTION_CODE_CRITERIA: Record<RejectionCode, string> = {
  hard_security_violation:
    "The code attempts to escape the sandbox or attack the host: script/DOM injection beyond the game's own document, eval/Function on obfuscated or constructed strings, prototype pollution, any network or exfiltration attempt (fetch, XHR, WebSocket, beacons, external <script src>), postMessage abuse targeting the parent frame, or deliberately obfuscated payloads whose purpose cannot be verified.",
  hard_forbidden_content:
    "Content unacceptable for a children's catalog under any fix: sexual or adult content, graphic violence or gore, hate or discrimination, self-harm, drugs, alcohol, tobacco, weapons glorification, or gambling mechanics (including simulated gambling for rewards).",
  hard_child_safety:
    "Anything that could endanger the child playing: grooming or predatory patterns, soliciting the child's name, photo, location or any contact information, directing the child to external chats, links, QR codes or meeting points, or building parasocial pressure to keep secrets from parents.",
  hard_copyright_infringement:
    "Recognizable third-party intellectual property: trademarked brands, characters or franchises (e.g. Star Wars, Disney, Pokémon), song lyrics, or assets evidently lifted from copyrighted works. Generic genre resemblance is fine; nameable IP is not.",
  soft_contains_personal_information:
    "Real-world personal information embedded in the game: children's or family names, phone numbers, email or postal addresses, school names, identifiable photos, or embedded credentials/API keys/secrets of any kind.",
  soft_bridge_protocol_mismatch:
    "The dodi bridge protocol is missing or wrong: the game never reports progress/success via the postMessage bridge, reports fake or hardcoded progress, or its declared goal/success criteria cannot actually be reached in play.",
  soft_age_appropriateness:
    "The content does not fit the declared target age range: too frightening, too complex, or too trivial for the stated ages — fixable by adjusting the range or the content.",
  soft_misleading_metadata:
    "Title, description, tags or learning goal do not match what the game actually is or teaches — the listing would mislead parents browsing Discover.",
  soft_quality_below_bar:
    "The game is broken or effectively empty: does not start, dead-ends, non-functional mechanics, placeholder text/assets, or unplayable in an obvious way.",
  soft_advertising_or_promotion:
    "Advertising or promotion aimed at the player: ads, brand promotion, calls to visit external products, services, channels or communities, or solicitation of payments/donations.",
  soft_translation_quality:
    "A locale's translations are wrong, misleading, or materially different from the source language. Compare ALL locales of the bundle's application/dodi-translations block and the per-locale listing title/description: meaning must match across languages, and no content may appear in one locale while hidden from another (cross-locale content smuggling is a safety issue — escalate to a hard code when the divergent content itself violates one).",
};

export function isRejectionCode(value: unknown): value is RejectionCode {
  return (
    typeof value === "string" &&
    (REJECTION_CODES as readonly string[]).includes(value)
  );
}

/** The kind is encoded in the code's prefix, so it can never disagree. */
export function rejectionKindOf(code: RejectionCode): RejectionKind {
  return code.startsWith("hard_") ? "hard" : "soft";
}

/**
 * The kind a verdict as a whole gets: any hard reason makes the rejection hard.
 * Callers must not pass an empty array (a rejection needs at least one reason).
 */
export function worstRejectionKind(
  reasons: readonly PublicationRejectionReason[],
): RejectionKind {
  return reasons.some((r) => rejectionKindOf(r.code) === "hard")
    ? "hard"
    : "soft";
}

/**
 * Tolerant reader for the `rejection_reasons` jsonb column. Unknown codes and
 * malformed entries are dropped rather than thrown — the column is written by
 * the platform but a taxonomy can shrink across versions, and the dialog should
 * still render the reasons it understands.
 */
export function parseRejectionReasons(
  value: unknown,
): PublicationRejectionReason[] {
  if (!Array.isArray(value)) return [];
  const reasons: PublicationRejectionReason[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { code, note } = entry as Record<string, unknown>;
    if (!isRejectionCode(code)) continue;
    reasons.push({ code, note: typeof note === "string" ? note : "" });
  }
  return reasons;
}
