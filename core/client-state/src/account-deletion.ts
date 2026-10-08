/**
 * Delete the parent's account: the platform re-checks the password and erases
 * the account with all family data (DELETE /api/account), which also ends
 * every session on every device. The client then clears its own device with
 * its sign-out path plus the platform's local wipe.
 */
import type { PlatformApi } from "./platform";

export type DeleteAccountOutcome =
  | { kind: "deleted" }
  /** A `settings` message key for the dialog's error line. */
  | {
      kind: "error";
      key:
        | "deleteAccountPasswordRequired"
        | "deleteAccountWrongPassword"
        | "deleteAccountRateLimited"
        | "deleteAccountFailed";
    };

export async function deleteAccount(
  deps: { api: Pick<PlatformApi, "request"> },
  password: string,
): Promise<DeleteAccountOutcome> {
  if (!password) return { kind: "error", key: "deleteAccountPasswordRequired" };
  try {
    const res = await deps.api.request("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    // 404: a concurrent request already deleted it, which is the goal.
    if (res.ok || res.status === 404) return { kind: "deleted" };
    if (res.status === 429) return { kind: "error", key: "deleteAccountRateLimited" };
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "WRONG_PASSWORD") return { kind: "error", key: "deleteAccountWrongPassword" };
    }
    return { kind: "error", key: "deleteAccountFailed" };
  } catch {
    return { kind: "error", key: "deleteAccountFailed" };
  }
}
