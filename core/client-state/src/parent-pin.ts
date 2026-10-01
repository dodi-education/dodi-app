/**
 * Set / change / remove the 4-digit parent PIN. The vault is open inside the
 * parent area, so the PIN is sealed with `session.encryptField` and only the
 * sealed blob reaches the platform. Changing or removing needs no current PIN
 * (like change-password needs no old password): the caller is already inside.
 */
import { patchAccount } from "./account-settings";
import type { AccountStore } from "./account-store";
import type { ParentLock, PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export const PARENT_PIN_LENGTH = 4;

/** Keys of the `parentPin` message namespace these flows answer with. */
export type ParentPinMessageKey = "invalid" | "saveFailed" | "saved" | "removed";

export type ParentPinOutcome =
  | { kind: "done"; key: "saved" | "removed" }
  | { kind: "error"; key: "invalid" | "saveFailed" };

/** Keep digits only, at most the PIN length (for the input's change handler). */
export function sanitizePinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PARENT_PIN_LENGTH);
}

export interface ParentPinDeps {
  api: PlatformApi;
  account: AccountStore;
  vault: VaultStore;
  parentLock: Pick<ParentLock, "markUnlocked">;
}

export async function saveParentPin(deps: ParentPinDeps, pin: string): Promise<ParentPinOutcome> {
  if (pin.length !== PARENT_PIN_LENGTH) return { kind: "error", key: "invalid" };
  const session = deps.vault.getState().session;
  if (!session) return { kind: "error", key: "saveFailed" };
  try {
    const parentPinEnc = session.encryptField(pin);
    const res = await patchAccount(deps.api, { parentPinEnc });
    if (!res.ok) throw new Error("save-failed");
    // Mark unlocked BEFORE caching the PIN, so the gate never observes
    // "PIN set + locked" for a frame (which would flash the prompt).
    deps.parentLock.markUnlocked();
    deps.account.getState().patchLocal({ parent_pin_enc: parentPinEnc });
    return { kind: "done", key: "saved" };
  } catch {
    return { kind: "error", key: "saveFailed" };
  }
}

export async function removeParentPin(
  deps: Pick<ParentPinDeps, "api" | "account">,
): Promise<ParentPinOutcome> {
  try {
    const res = await patchAccount(deps.api, { parentPinEnc: null });
    if (!res.ok) throw new Error("remove-failed");
    deps.account.getState().patchLocal({ parent_pin_enc: null });
    return { kind: "done", key: "removed" };
  } catch {
    return { kind: "error", key: "saveFailed" };
  }
}
