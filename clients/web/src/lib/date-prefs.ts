/**
 * Map a stored `date_preferences` blob (the account/kid jsonb column) into
 * an in-memory partial preference. Shared logic: `@dodi/client-state`
 * date-preferences (the sealed timezone opens with the VaultSession there).
 */
export { readStoredDatePref } from "@dodi/client-state/date-preferences";
