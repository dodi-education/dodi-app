/**
 * The kid view's non-rendering flows, shared by the web and the app: entering
 * and leaving the kid view, the avatar-PIN gate, switching kids and editing a
 * kid's look from the switcher.
 *
 * The avatar PIN is a sibling gate, not key material: the (decrypted) PIN is
 * compared on the device. A kid's look is E2EE: the new `avatar_config` is
 * sealed under the vault before the PATCH, and friends get a re-sealed card
 * (friend cards are point-in-time snapshots, so every shared-field edit must
 * be pushed to each friend).
 */
import type { Json, Kid } from "@dodi/types/database";
import { encryptKidFields } from "@dodi/vault";

import type { ActiveKidStore } from "./active-kid-store";
import { computeNeedsPin, pickActiveKidId } from "./active-kid-store";
import { type AvatarConfig, PIN_LENGTH, readAvatarConfig } from "./avatars";
import type { CompanionSessionState } from "./companion-session";
import type { KidStore } from "./kid-store";
import type { ActiveKidPersistence, ParentLock, PlatformApi } from "./platform";
import type { ProvidersStore } from "./providers-store";
import type { VaultStore } from "./vault-store";

// ----- Entering / leaving ---------------------------------------------------

export interface EnterKidViewDeps {
  kids: KidStore;
  persistence: Pick<ActiveKidPersistence, "readActiveKidId" | "writeActiveKid">;
  parentLock: ParentLock;
}

/**
 * The parent's "Kid View" switch: keep the last-used kid if it still exists,
 * else the first, and persist it (with its language, for the kid's UI locale).
 * Leaving for the kid view re-locks the parent area on this device. A locked
 * vault or failed fetch still switches views (no kid persisted). Does NOT
 * mark the kid unlocked: a PIN-protected profile still shows its puzzle.
 */
export async function enterKidView(deps: EnterKidViewDeps): Promise<Kid | null> {
  let kids: Kid[] = [];
  try {
    kids = await deps.kids.getState().loadList();
  } catch {
    // Vault locked / fetch failed: switch views anyway.
  }
  let picked: Kid | null = null;
  if (kids.length > 0) {
    const id = pickActiveKidId(kids, deps.persistence.readActiveKidId());
    picked = kids.find((k) => k.id === id) ?? kids[0];
    deps.persistence.writeActiveKid({ id: picked.id, language: picked.language ?? "en" });
  }
  deps.parentLock.clear();
  return picked;
}

export interface KidViewMountDeps {
  parentLock: ParentLock;
  vault: VaultStore;
}

/**
 * What the kid layout does on mount: being in the kid view always locks the
 * parent area for this device session (returning needs the parent PIN again,
 * when one is set), and the vault is re-opened silently with the device key
 * (kids enter after the parent unlocked it).
 */
export function onKidViewMount(deps: KidViewMountDeps): void {
  deps.parentLock.clear();
  const { status, unlockSilently } = deps.vault.getState();
  if (status !== "unlocked") void unlockSilently();
}

// ----- Avatar PIN -------------------------------------------------------------

/** The kid's decrypted PIN sequence, or null when the puzzle is off. */
export function parseAvatarPin(kid: Pick<Kid, "avatar_pin">): string[] | null {
  if (!kid.avatar_pin) return null;
  try {
    const arr: unknown = JSON.parse(kid.avatar_pin);
    return Array.isArray(arr) && arr.length === PIN_LENGTH ? (arr as string[]) : null;
  } catch {
    return null;
  }
}

/** Whether a solved sequence matches the kid's PIN (always false without one). */
export function verifyAvatarPin(kid: Pick<Kid, "avatar_pin">, sequence: string[]): boolean {
  const pin = parseAvatarPin(kid);
  return !!pin && pin.length === sequence.length && pin.every((a, i) => a === sequence[i]);
}

/** The switcher's response to tapping a kid in "Who's playing?". */
export type KidPickAction = "none" | "puzzle" | "switch";

export function kidPickAction(
  kid: Kid,
  state: { activeKidId: string | null; needsPin: boolean; unlockedKidIds: ReadonlySet<string> },
): KidPickAction {
  // Re-tapping the already-active, unlocked kid is a no-op.
  if (kid.id === state.activeKidId && !state.needsPin) return "none";
  return computeNeedsPin(kid, state.unlockedKidIds) ? "puzzle" : "switch";
}

/**
 * A correct puzzle for the gated ACTIVE profile only unlocks it (entry gate);
 * for another profile it switches to that kid.
 */
export function solvedPinAction(kidId: string, activeKidId: string | null): "unlock" | "switch" {
  return kidId === activeKidId ? "unlock" : "switch";
}

/** Delay between a correct puzzle and the unlock/switch (the slots show filled). */
export const PIN_SOLVED_DELAY_MS = 250;
/** How long a wrong sequence shakes before the slots reset. */
export const PIN_SHAKE_MS = 520;

export interface KidSwitchDeps {
  activeKid: ActiveKidStore;
  /**
   * Ends the outgoing kid's voice session (fires its memory update). The
   * web's voice store; a no-op where the voice companion isn't wired yet.
   */
  endVoiceSession: () => void;
}

/** Switch to another kid: end the outgoing voice session, persist + unlock. */
export function switchActiveKid(deps: KidSwitchDeps, kid: Kid): void {
  deps.endVoiceSession();
  deps.activeKid.getState().setActive(kid);
}

// ----- Look editor ------------------------------------------------------------

export interface KidLookDeps {
  api: PlatformApi;
  kids: KidStore;
  vault: VaultStore;
}

/**
 * Persist a look change for a kid: optimistic local patch, then the sealed
 * `avatar_config` PATCH (fire-and-forget). Returns false when the vault is
 * locked, so nothing was sent (the local patch still applies).
 */
export function updateKidLook(deps: KidLookDeps, kid: Kid, partial: Partial<AvatarConfig>): boolean {
  const cfg: AvatarConfig = { ...readAvatarConfig(kid.avatar_config), ...partial };
  const cfgJson: Json = { color: cfg.color, avatar: cfg.avatar };
  deps.kids.getState().patchLocal(kid.id, { avatar_config: cfgJson });

  const session = deps.vault.getState().session;
  if (!session) return false;
  const enc = encryptKidFields(session, { avatar_config: cfgJson });
  void deps.api
    .request(`/api/kids/${kid.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_config: enc.avatar_config }),
    })
    .catch(() => {});
  return true;
}

export interface CardRefreshScheduler {
  /** (Re)start the debounce for this kid. */
  schedule(kidId: string): void;
  /** Run a pending refresh now (popover closed / unmounted). */
  flush(): void;
}

/** Debounce for re-sealing a kid's friend cards while they tap through looks. */
export const CARD_REFRESH_DELAY_MS = 1200;

/**
 * Re-seal a kid's friend cards after they edit their look, so friends see the
 * new avatar/color: debounced across rapid taps, flushed when the editor
 * closes so a friend never keeps a stale card.
 */
export function createCardRefreshScheduler(
  refresh: (kidId: string) => void,
  delayMs: number = CARD_REFRESH_DELAY_MS,
): CardRefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingKidId: string | null = null;

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const kidId = pendingKidId;
    pendingKidId = null;
    if (kidId) refresh(kidId);
  }

  return {
    schedule(kidId) {
      pendingKidId = kidId;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}

// ----- Pull to refresh (the app's kid home) ------------------------------------

/** The companion session, as far as the kid home's refresh needs it. */
export interface CompanionRetryTarget {
  getState(): Pick<CompanionSessionState, "state" | "error" | "fatalError" | "connect">;
}

export interface KidHomeRefreshDeps {
  providers: ProvidersStore;
  companion: CompanionRetryTarget;
}

/** dodi is disconnected after an error: the home shows "Tap to retry". */
export function isCompanionInError(
  session: Pick<CompanionSessionState, "state" | "error" | "fatalError">,
): boolean {
  return session.state === "disconnected" && (session.error !== null || session.fatalError);
}

/**
 * A pull on the kid home: reload the (E2EE) provider keys past the cache and,
 * when dodi is stuck in its connection error, retry the way "Tap to retry"
 * does (`connect`, which also clears a fatal error). Not awaited: the voice
 * bring-up has its own "connecting" state, the spinner shouldn't wait for it.
 *
 * Resolves whether a provider is set up, or null when the keys could not be
 * loaded (offline, vault locked): the home then keeps what it shows.
 */
export async function refreshKidHome(deps: KidHomeRefreshDeps, kidId: string): Promise<boolean | null> {
  let hasProvider: boolean;
  try {
    hasProvider = Object.keys(await deps.providers.getState().load(true)).length > 0;
  } catch {
    return null;
  }
  const companion = deps.companion.getState();
  if (hasProvider && isCompanionInError(companion)) {
    void companion.connect(kidId).catch(() => {});
  }
  return hasProvider;
}
