/**
 * What a companion session error means for the kid, so the screens can say
 * something useful instead of showing the raw (English, technical) message.
 *
 * - `micPermissionNeeded` / `secureContextRequired`: the session store's own
 *   codes for a microphone that cannot be opened.
 * - `needsSetup`: retrying will not help until a grown-up fixes the account
 *   (no provider or key, a rejected key, a used-up quota, a locked vault).
 * - `connection`: anything else; a retry is worth a try.
 */
export type CompanionErrorKind =
  | "micPermissionNeeded"
  | "secureContextRequired"
  | "needsSetup"
  | "connection";

/**
 * Matches the messages of the failures only a grown-up can fix: the voice
 * resolver (`companion-sources`), the close classifier (`classifyClose` in
 * `@dodi/ai/voice/voice-client`) and the xAI token mint.
 */
const NEEDS_SETUP_PATTERN =
  /no api key configured|no ai provider configured|couldn't authenticate|quota|vault is locked/i;

export function companionErrorKind(error: string): CompanionErrorKind {
  if (error === "micPermissionNeeded" || error === "secureContextRequired") return error;
  if (NEEDS_SETUP_PATTERN.test(error)) return "needsSetup";
  return "connection";
}
