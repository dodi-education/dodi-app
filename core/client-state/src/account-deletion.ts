/**
 * Deleting an account and deleting a profile are separate things:
 *
 * - The owner deletes the **account** (DELETE /api/account): the platform
 *   re-checks the password and erases the account with all its data. Every
 *   profile stays, the owner's too; the client drops what it held of the
 *   account and reloads into another account or the "no account" screen.
 * - A person deletes their **profile** (DELETE /api/me): their login and
 *   memberships; the accounts they were in stay. Refused while they still own
 *   an account. Every session ends, so the client signs out and wipes the
 *   device.
 */
import { reopenFamily, type FamilySwitchDeps } from "./family-members";
import type { PlatformApi } from "./platform";

type DeletionErrorKey =
  | "deletePasswordRequired"
  | "deleteWrongPassword"
  | "deleteRateLimited"
  | "deleteFailed";

export type DeleteAccountOutcome =
  | { kind: "deleted" }
  /** A `settings` message key for the dialog's error line. */
  | { kind: "error"; key: DeletionErrorKey };

export type DeleteProfileOutcome =
  | { kind: "deleted" }
  /** A `settings` message key for the dialog's error line. */
  | { kind: "error"; key: DeletionErrorKey | "deleteProfileOwnsAccount" };

async function deleteWithPassword(
  api: Pick<PlatformApi, "request">,
  path: string,
  password: string,
): Promise<
  | { kind: "deleted" }
  | { kind: "error"; key: DeletionErrorKey }
  | { kind: "conflict" }
> {
  if (!password) return { kind: "error", key: "deletePasswordRequired" };
  try {
    const res = await api.request(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    // 404: a concurrent request already deleted it, which is the goal.
    if (res.ok || res.status === 404) return { kind: "deleted" };
    if (res.status === 429) return { kind: "error", key: "deleteRateLimited" };
    if (res.status === 409) return { kind: "conflict" };
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (body?.code === "WRONG_PASSWORD")
        return { kind: "error", key: "deleteWrongPassword" };
    }
    return { kind: "error", key: "deleteFailed" };
  } catch {
    return { kind: "error", key: "deleteFailed" };
  }
}

/**
 * The owner deletes the active account with all its data. On success this
 * device drops everything it held of the account and reopens whatever the
 * platform resolves next: another account of theirs, or none (the vault gate
 * then shows the "no account" screen).
 */
export async function deleteAccount(
  deps: FamilySwitchDeps,
  password: string,
): Promise<DeleteAccountOutcome> {
  const outcome = await deleteWithPassword(deps.api, "/api/account", password);
  if (outcome.kind === "conflict")
    return { kind: "error", key: "deleteFailed" };
  if (outcome.kind === "deleted") await reopenFamily(deps);
  return outcome;
}

/** A person deletes their own profile (refused while they own an account). */
export async function deleteProfile(
  deps: { api: Pick<PlatformApi, "request"> },
  password: string,
): Promise<DeleteProfileOutcome> {
  const outcome = await deleteWithPassword(deps.api, "/api/me", password);
  return outcome.kind === "conflict"
    ? { kind: "error", key: "deleteProfileOwnsAccount" }
    : outcome;
}
