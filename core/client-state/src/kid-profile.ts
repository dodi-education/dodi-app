/**
 * The parent's kid pages (/parent/kids, /new, /{id}): create, edit, delete a
 * kid, its avatar-PIN puzzle and its date/time override. Companions (and their
 * personas) are companions.ts.
 *
 * E2EE: name, birthdate and the PIN sequence are sealed with the vault before
 * they leave the device (`encryptKidFields`); an explicit timezone is sealed
 * too. Friend cards are point-in-time snapshots, so a save that changes a
 * shared field re-seals the kid's card to every friend. Clients render the
 * forms and map {@link FlowError}s to copy.
 */
import { SUPPORTED_LOCALES, type Locale } from "@dodi/intl/locales";
import type { DateStyleId, StoredDatePreferences, TimeStyleId } from "@dodi/intl/prefs";
import type { Kid } from "@dodi/types/database";
import { encryptKidFields } from "@dodi/vault/kid-crypto";
import type { VaultSession } from "@dodi/vault";

import { PIN_LENGTH } from "./avatars";
import { FlowError, jsonInit, serverErrorOf } from "./flow-error";
import { refreshFriendCards } from "./friend-cards";
import type { GameStore } from "./game-store";
import type { KidStore } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface KidProfileDeps {
  api: PlatformApi;
  kids: KidStore;
  vault: VaultStore;
}

/** The kid's UI-language options (the native names, untranslated). */
export const KID_LANGUAGE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

export const KID_LANGUAGE_OPTIONS: { value: Locale; label: string }[] = SUPPORTED_LOCALES.map(
  (l) => ({ value: l, label: KID_LANGUAGE_NAMES[l] }),
);

/** Max lengths of the name and friend-code fields. */
export const KID_NAME_MAX_LENGTH = 50;
export const SOCIAL_ID_MAX_LENGTH = 30;

function sessionOrThrow(vault: VaultStore): VaultSession {
  const session = vault.getState().session;
  if (!session) throw new FlowError("vault_locked");
  return session;
}

/**
 * Friend codes are canonically uppercase (see generateSocialId); the kid-side
 * lookup uppercases too, so a lowercase value saved here would never resolve.
 */
export function canonicalSocialId(raw: string): string {
  return raw.toUpperCase();
}

/** Which required fields are empty (the form marks them aria-invalid). */
export function invalidKidFields(form: { displayName: string; socialId?: string }): {
  name: boolean;
  socialId: boolean;
} {
  return {
    name: !form.displayName.trim(),
    socialId: form.socialId !== undefined && !form.socialId.trim(),
  };
}

// ----- Create -------------------------------------------------------------------

export interface NewKidForm {
  displayName: string;
  /** Canonical YYYY-MM-DD, "" when unset. */
  birthdate: string;
  language: string;
}

/**
 * Create a kid: seal its name (and birthdate) and POST. social_id (the public
 * friend handle) is assigned randomly server-side. The server also shares the
 * system games with the new kid, so the game cache is dropped too.
 */
export async function createKid(
  deps: KidProfileDeps & { games: GameStore },
  form: NewKidForm,
): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const enc = encryptKidFields(session, {
    display_name: form.displayName,
    ...(form.birthdate ? { birthdate: form.birthdate } : {}),
  });
  const res = await deps.api.request(
    "/api/kids",
    jsonInit("POST", {
      display_name: enc.display_name,
      birthdate: enc.birthdate,
      language: form.language,
    }),
  );
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
  deps.games.getState().invalidate();
}

// ----- Edit ---------------------------------------------------------------------

export interface KidProfileForm {
  displayName: string;
  socialId: string;
  /** Canonical YYYY-MM-DD, "" when unset. */
  birthdate: string;
  language: string;
  canAddFriends: boolean;
  canBeAddedAsFriend: boolean;
  incomingApproval: boolean;
  outgoingApproval: boolean;
  canChangeCompanionAvatar: boolean;
}

/** The edit form's initial values from a DECRYPTED kid. */
export function kidProfileFormOf(kid: Kid): KidProfileForm {
  return {
    displayName: kid.display_name,
    socialId: kid.social_id,
    birthdate: kid.birthdate ?? "",
    language: kid.language ?? "en",
    canAddFriends: kid.can_add_friends ?? true,
    canBeAddedAsFriend: kid.can_be_added_as_friend ?? true,
    incomingApproval: kid.incoming_friend_requests_require_parent_approval ?? true,
    outgoingApproval: kid.outgoing_friend_requests_require_parent_approval ?? false,
    canChangeCompanionAvatar: kid.can_change_companion_avatar ?? false,
  };
}

/**
 * Save the profile fields. Afterwards re-seal the kid's friend cards so
 * friends see the new name / birthdate: best-effort, the kid is already saved
 * (friends pick the change up on the next refresh). `kid` is the DECRYPTED
 * row the form was opened from.
 */
export async function updateKidProfile(
  deps: KidProfileDeps,
  kid: Kid,
  form: KidProfileForm,
): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const enc = encryptKidFields(session, {
    display_name: form.displayName,
    birthdate: form.birthdate || null,
  });
  const res = await deps.api.request(
    `/api/kids/${kid.id}`,
    jsonInit("PATCH", {
      display_name: enc.display_name,
      social_id: form.socialId,
      birthdate: enc.birthdate,
      language: form.language,
      can_add_friends: form.canAddFriends,
      can_be_added_as_friend: form.canBeAddedAsFriend,
      incoming_friend_requests_require_parent_approval: form.incomingApproval,
      outgoing_friend_requests_require_parent_approval: form.outgoingApproval,
      can_change_companion_avatar: form.canChangeCompanionAvatar,
    }),
  );
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));

  try {
    await refreshFriendCards(
      deps.api,
      { ...kid, display_name: form.displayName, birthdate: form.birthdate || null },
      session,
    );
  } catch {
    // ignored: friends pick up the change on the next refresh
  }
  deps.kids.getState().invalidate();
}

/** Delete the kid (the platform cascades). */
export async function deleteKid(deps: KidProfileDeps, kidId: string): Promise<void> {
  const res = await deps.api.request(`/api/kids/${kidId}`, { method: "DELETE" });
  if (!res.ok) throw new FlowError("request_failed");
  deps.kids.getState().invalidate();
}

// ----- Avatar-PIN puzzle --------------------------------------------------------

export type PinSlots = (string | null)[];

export function emptyPinSlots(): PinSlots {
  return Array<string | null>(PIN_LENGTH).fill(null);
}

/** Parse a decrypted `avatar_pin` (JSON array of 3 ids) into slots, or null. */
export function parseStoredPin(raw: string | null): PinSlots | null {
  if (!raw) return null;
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) && arr.length === PIN_LENGTH ? (arr as PinSlots) : null;
  } catch {
    return null;
  }
}

/** An enabled puzzle needs every slot filled before it can be saved. */
export function isPinIncomplete(isEnabled: boolean, slots: PinSlots): boolean {
  return isEnabled && slots.some((s) => s == null);
}

/** Save (sealed) or clear (`isEnabled` false) the kid's avatar-PIN puzzle. */
export async function saveKidPin(
  deps: KidProfileDeps,
  kidId: string,
  isEnabled: boolean,
  slots: PinSlots,
): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const enc = encryptKidFields(session, {
    avatar_pin: isEnabled ? JSON.stringify(slots) : null,
  });
  const res = await deps.api.request(`/api/kids/${kidId}`, jsonInit("PATCH", { avatar_pin: enc.avatar_pin }));
  if (!res.ok) throw new FlowError("request_failed");
  deps.kids.getState().invalidate();
}

// ----- Date/time override -------------------------------------------------------

/** The per-kid override form ("" = inherit the account default). */
export interface KidDatePrefsForm {
  dateStyle: DateStyleId | "";
  timeStyle: TimeStyleId | "";
  timeZone: string;
}

/** The override form from a kid's stored `date_preferences` (sealed zone opened). */
export function kidDatePrefsFormOf(kid: Kid, session: VaultSession | null): KidDatePrefsForm {
  const dp = kid.date_preferences as StoredDatePreferences | null | undefined;
  let timeZone = "";
  if (dp?.timeZoneEnc && session) {
    try {
      timeZone = session.decryptField(dp.timeZoneEnc) ?? "";
    } catch {
      timeZone = "";
    }
  }
  return { dateStyle: dp?.dateStyle ?? "", timeStyle: dp?.timeStyle ?? "", timeZone };
}

/** Save the override: only explicit values are stored; a set zone is sealed. */
export async function saveKidDatePreferences(
  deps: KidProfileDeps,
  kidId: string,
  form: KidDatePrefsForm,
): Promise<void> {
  const datePreferences: StoredDatePreferences = {};
  if (form.dateStyle) datePreferences.dateStyle = form.dateStyle;
  if (form.timeStyle) datePreferences.timeStyle = form.timeStyle;
  if (form.timeZone) {
    datePreferences.timeZoneEnc = sessionOrThrow(deps.vault).encryptField(form.timeZone);
  }
  const res = await deps.api.request(
    `/api/kids/${kidId}`,
    jsonInit("PATCH", { date_preferences: datePreferences }),
  );
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
}

// ----- List ---------------------------------------------------------------------

/** A kid's avatar initial (uppercase first letter of the decrypted name). */
export function kidInitial(name: string | null | undefined): string {
  return (name?.[0] ?? "").toUpperCase();
}
