/**
 * The failure a parent-page flow (kids, personas, memory) reports to its
 * screen. `reason` picks the copy; `message` carries the server's own error
 * text when it sent one ("" otherwise), which the web shows in place of its
 * generic "failed to …" string.
 */
export type FlowFailure = "vault_locked" | "too_long" | "request_failed";

export class FlowError extends Error {
  constructor(
    readonly reason: FlowFailure,
    message = "",
  ) {
    super(message);
    this.name = "FlowError";
  }
}

/**
 * The web's (untranslated) copy for a locked vault on the kid pages. Kept
 * verbatim so both clients show the same text.
 */
export const VAULT_LOCKED_MESSAGE = "Your secure vault is locked. Please reload and try again.";

/** The `error` text of a failed JSON response, "" when there is none. */
export async function serverErrorOf(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : "";
}

/** PATCH/POST a JSON body. */
export function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * The copy for a failed flow: the server's text when it sent one, the
 * vault-locked text, else the caller's generic fallback.
 */
export function flowErrorText(
  error: unknown,
  fallback: string,
  copy: { vaultLocked?: string; tooLong?: string } = {},
): string {
  if (error instanceof FlowError) {
    if (error.reason === "vault_locked") return copy.vaultLocked ?? VAULT_LOCKED_MESSAGE;
    if (error.reason === "too_long" && copy.tooLong) return copy.tooLong;
    return error.message || fallback;
  }
  return fallback;
}
