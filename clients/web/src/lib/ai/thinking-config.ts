/**
 * Shared messaging for flows that require an explicitly configured thinking
 * model. Kept dependency-free so both client and server code can import it.
 *
 * Background: complex tasks (game build/edit, memory updates, the in-game
 * assistant) must run on a generateContent-capable "thinking" model. We used to
 * silently fall back to the account's *voice* provider/model when none was set —
 * but Live (voice) models can't serve generateContent, which surfaced as
 * "invalid x-api-key"/auth failures. The fallback has been removed; callers now
 * require an explicit thinking model and surface this message instead.
 */
export const THINKING_MODEL_REQUIRED_MESSAGE =
  "No thinking model is set. Open Settings and choose a thinking provider and model before Dodi can create or edit games.";
