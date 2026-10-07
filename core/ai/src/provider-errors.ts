/**
 * Provider error classification shared by the clients' provider adapters.
 */

/**
 * The provider rejected the API key (HTTP 401): an expired, rotated or deleted
 * key. Recognizes the SDK errors (`status` on openai / anthropic APIError) and
 * the fetch-based adapters, which put the status in the message ("… (401)").
 */
export function isProviderAuthError(err: unknown): boolean {
  return hasHttpStatus(err, 401);
}

/**
 * The provider refused the call for lack of funds (HTTP 402) on the account
 * that owns the key, e.g. Venice "Insufficient USD or Diem balance".
 */
export function isProviderBalanceError(err: unknown): boolean {
  return hasHttpStatus(err, 402);
}

function hasHttpStatus(err: unknown, status: number): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ((err as { status?: unknown }).status === status) return true;
  return err instanceof Error && new RegExp(`\\b${status}\\b`).test(err.message);
}
