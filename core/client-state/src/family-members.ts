/**
 * Family members: who is in the family, inviting another adult, and joining
 * from an invitation link. Shared by every client; screens render the states
 * and map the outcome keys to copy.
 *
 * Inviting (owner or co-parent, vault open): the browser seals the family's
 * key under a fresh link secret (`VaultSession.createInvite`), stores only
 * the sealed copy, and hands back a link with the secret in its #fragment.
 * The inviter sends the link themselves (mail app, share sheet, copy); the
 * platform never sees the secret.
 *
 * Joining (the invited person, signed in with the invited address): open the
 * sealed key with the secret from the link, wrap it to the login's personal
 * key (created here when it has none), accept, and open the session.
 */
import type {
  FamilyMember,
  InvitableRole,
  InvitationKey,
  InvitationPreview,
  PendingInvitation,
} from "@dodi/protocol/family-members";
import {
  type DeviceKeystore,
  type StoredUserKeys,
  addDeviceToVault,
  createUserKeys,
  getOrCreateDevice,
  isUserKeyFor,
  openInviteWrap,
  unlockVaultWithPassword,
  wrapVaultKeyForMember,
} from "@dodi/vault";
import { toBase64Url } from "@dodi/crypto";

import {
  type AuthApi,
  type AuthMessageKey,
  MIN_PASSWORD_LENGTH,
  captchaHeaders,
  isCaptchaError,
  otpErrorKey,
} from "./auth";
import { fetchUserKeys, putUserVaultKeys } from "./member-vault";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export type { FamilyMember, InvitableRole, InvitationPreview, PendingInvitation };

const JSON_HEADERS = { "Content-Type": "application/json" };

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  return body?.code;
}

// ---------------------------------------------------------------------------
// The family
// ---------------------------------------------------------------------------

export interface FamilyOverview {
  members: FamilyMember[];
  /** Open invitations (only the owner and co-parents see them). */
  invitations: PendingInvitation[];
}

/** Who is in the family, and (for those who manage it) who is invited. Null when unreachable. */
export async function loadFamily(
  api: PlatformApi,
  options: { canManage: boolean },
): Promise<FamilyOverview | null> {
  try {
    const [membersRes, invitationsRes] = await Promise.all([
      api.request("/api/account/members"),
      options.canManage ? api.request("/api/account/invitations") : null,
    ]);
    if (!membersRes.ok) return null;
    const { members } = (await membersRes.json()) as { members: FamilyMember[] };
    const invitations =
      invitationsRes?.ok
        ? ((await invitationsRes.json()) as { invitations: PendingInvitation[] }).invitations
        : [];
    return { members, invitations };
  } catch {
    return null;
  }
}

/** Whether a role may invite and remove people (and see invitations). */
export function canManageFamily(role: FamilyMember["role"] | null | undefined): boolean {
  return role === "owner" || role === "co_parent";
}

/** The link an invitation travels as; the secret stays in the #fragment. */
export function invitationLink(appUrl: string, id: string, secret: string): string {
  return `${appUrl.replace(/\/$/, "")}/join/${id}#k=${secret}`;
}

/** The secret from a join link's fragment (`#k=…`), or null when it is missing. */
export function inviteSecretFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const secret = params.get("k");
  return secret && /^[A-Za-z0-9_-]{20,100}$/.test(secret) ? secret : null;
}

/** A `mailto:` link that opens the inviter's own mail app with the invitation filled in. */
export function inviteMailtoHref(input: { to: string; subject: string; body: string }): string {
  const query = new URLSearchParams({ subject: input.subject, body: input.body })
    .toString()
    .replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(input.to)}?${query}`;
}

export type InviteOutcome =
  | { kind: "created"; id: string; link: string; expiresAt: string }
  | { kind: "error"; key: "inviteAlreadyMember" | "inviteRateLimited" | "inviteVaultLocked" | "inviteFailed" };

/** Invite another adult: seal the family's key for the link and store the invitation. */
export async function createFamilyInvite(
  deps: { api: PlatformApi; vault: VaultStore },
  input: { email: string; role: InvitableRole; scopes?: readonly string[]; appUrl: string },
): Promise<InviteOutcome> {
  const session = deps.vault.getState().session;
  if (!session) return { kind: "error", key: "inviteVaultLocked" };
  const invite = session.createInvite();
  try {
    const res = await deps.api.request("/api/account/invitations", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: input.email.trim(),
        role: input.role,
        ...(input.role === "member" ? { scopes: input.scopes ?? [] } : {}),
        vmkInviteWrap: invite.sealed,
      }),
    });
    if (!res.ok) {
      const code = await errorCode(res);
      if (code === "ALREADY_MEMBER") return { kind: "error", key: "inviteAlreadyMember" };
      if (code === "RATE_LIMITED") return { kind: "error", key: "inviteRateLimited" };
      return { kind: "error", key: "inviteFailed" };
    }
    const { id, expiresAt } = (await res.json()) as { id: string; expiresAt: string };
    return { kind: "created", id, expiresAt, link: invitationLink(input.appUrl, id, invite.secret) };
  } catch {
    return { kind: "error", key: "inviteFailed" };
  }
}

/** Cancel an invitation (its link stops working). True when cancelled. */
export async function cancelFamilyInvite(api: PlatformApi, id: string): Promise<boolean> {
  try {
    const res = await api.request(`/api/account/invitations/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Change a non-owner's role and scopes. True when saved. */
export async function updateFamilyMember(
  api: PlatformApi,
  userId: string,
  input: { role: InvitableRole; scopes: readonly string[] },
): Promise<boolean> {
  try {
    const res = await api.request(`/api/account/members/${userId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(input.role === "member" ? input : { role: input.role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Remove someone from the family, or leave it (your own id). True when done. */
export async function removeFamilyMember(api: PlatformApi, userId: string): Promise<boolean> {
  try {
    const res = await api.request(`/api/account/members/${userId}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** What moving this device to another family needs (ClientState provides both). */
export interface FamilySwitchDeps {
  api: PlatformApi;
  vault: VaultStore;
  /** ClientState.dropFamilyData: lock, drop caches, wipe the offline cache. */
  dropFamilyData: () => Promise<void>;
}

/**
 * The session now points at another family (or none): forget the old one and
 * open whatever the platform resolves next. The vault gate takes it from
 * there (unlocked, unlock prompt, first-time setup, or no family).
 */
export async function reopenFamily(deps: FamilySwitchDeps): Promise<void> {
  await deps.dropFamilyData();
  await deps.vault.getState().unlockSilently();
}

/** Leave the family (not the owner). The device moves to the login's other family, if any. */
export async function leaveFamily(deps: FamilySwitchDeps, userId: string): Promise<boolean> {
  if (!(await removeFamilyMember(deps.api, userId))) return false;
  await reopenFamily(deps);
  return true;
}

/** One family of the signed-in login (for the switcher). */
export interface LoginFamily {
  accountId: string;
  role: FamilyMember["role"];
  /** Families have no plaintext name; the owner's address tells them apart. */
  ownerEmail: string | null;
  isActive: boolean;
}

/** Every family the login belongs to (empty when unreachable). */
export async function loadMyFamilies(api: PlatformApi): Promise<LoginFamily[]> {
  try {
    const res = await api.request("/api/me/families");
    if (!res.ok) return [];
    return ((await res.json()) as { families: LoginFamily[] }).families;
  } catch {
    return [];
  }
}

/**
 * Whether the login owns one of these accounts: an owner deletes the account
 * before their profile can go (the platform refuses otherwise).
 */
export function ownsAnAccount(families: readonly LoginFamily[]): boolean {
  return families.some((family) => family.role === "owner");
}

/** Switch this device to another of the login's families. True when switched. */
export async function switchFamily(deps: FamilySwitchDeps, accountId: string): Promise<boolean> {
  try {
    const res = await deps.api.request("/api/me/active-family", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ accountId }),
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  await reopenFamily(deps);
  return true;
}

export type StartFamilyOutcome = { kind: "started" } | { kind: "error"; key: "familyLimit" | "startFamilyFailed" };

/**
 * Start a family owned by this login and switch to it. Its vault does not
 * exist yet: the gate's first-time setup (finish-setup) creates it with the
 * login's password, as after sign-up.
 */
export async function startOwnFamily(deps: FamilySwitchDeps): Promise<StartFamilyOutcome> {
  try {
    const res = await deps.api.request("/api/families", { method: "POST" });
    if (!res.ok) {
      return {
        kind: "error",
        key: (await errorCode(res)) === "FAMILY_LIMIT" ? "familyLimit" : "startFamilyFailed",
      };
    }
  } catch {
    return { kind: "error", key: "startFamilyFailed" };
  }
  await reopenFamily(deps);
  return { kind: "started" };
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

/** The public facts of an invitation (null when there is none). */
export async function loadInvitationPreview(
  api: PlatformApi,
  id: string,
): Promise<InvitationPreview | null> {
  try {
    const res = await api.request(`/api/invitations/${id}`);
    if (!res.ok) return null;
    return ((await res.json()) as { invitation: InvitationPreview }).invitation;
  } catch {
    return null;
  }
}

export type JoinErrorKey =
  | "joinLinkIncomplete"
  | "joinWrongEmail"
  | "joinExpired"
  | "joinUsed"
  | "joinAlreadyMember"
  | "joinFailed";

export type JoinOutcome = { kind: "joined"; accountId: string } | { kind: "error"; key: JoinErrorKey };

function joinErrorKey(code: string | undefined): JoinErrorKey {
  switch (code) {
    case "WRONG_EMAIL":
      return "joinWrongEmail";
    case "EXPIRED":
      return "joinExpired";
    case "NOT_PENDING":
    case "NOT_FOUND":
      return "joinUsed";
    case "ALREADY_MEMBER":
      return "joinAlreadyMember";
    default:
      return "joinFailed";
  }
}

/**
 * The login's personal key for joining: its stored one when the password
 * opens it, otherwise a new one (a login that never joined a family, or whose
 * old key no longer opens with its current password).
 */
async function personalKeyFor(
  deps: { api: PlatformApi; deviceKeystore: DeviceKeystore },
  password: string,
): Promise<{ seed: Uint8Array; kemPublicKey: string; created?: StoredUserKeys }> {
  const existing = await fetchUserKeys(deps.api);
  const device = await getOrCreateDevice(deps.deviceKeystore);
  if (existing) {
    let seed: Uint8Array | null = null;
    try {
      seed = await unlockVaultWithPassword(existing.vaultKeys, password);
    } catch {
      // Falls through to a new key.
    }
    if (seed && isUserKeyFor(existing, seed)) {
      // So this device opens it without the password next time.
      if (!existing.vaultKeys.deviceWraps.some((wrap) => wrap.deviceId === device.deviceId)) {
        const registration = {
          deviceId: device.deviceId,
          deviceKemPublicKey: toBase64Url(device.kem.publicKey),
        };
        await putUserVaultKeys(deps.api, addDeviceToVault(existing.vaultKeys, seed, registration)).catch(
          () => {},
        );
      }
      return { seed, kemPublicKey: existing.kemPublicKey };
    }
  }
  const { seed, userKeys } = await createUserKeys({
    password,
    device: { deviceId: device.deviceId, deviceKemPublicKey: toBase64Url(device.kem.publicKey) },
  });
  return { seed, kemPublicKey: userKeys.kemPublicKey, created: userKeys };
}

/**
 * Join the family behind an invitation. The login must be signed in with the
 * invited address; `password` is its login password (it seals the personal
 * key). On success the vault is open as the new family.
 */
export async function joinFamily(
  deps: {
    api: PlatformApi;
    vault: VaultStore;
    deviceKeystore: DeviceKeystore;
    /** Forget the family this device had open (ClientState.dropFamilyData). */
    dropFamilyData: () => Promise<void>;
  },
  input: { invitationId: string; secret: string; password: string },
): Promise<JoinOutcome> {
  try {
    const keyRes = await deps.api.request(`/api/invitations/${input.invitationId}/key`);
    if (!keyRes.ok) return { kind: "error", key: joinErrorKey(await errorCode(keyRes)) };
    const key = (await keyRes.json()) as InvitationKey;

    let vmk: Uint8Array;
    try {
      vmk = openInviteWrap(input.secret, key.vmkInviteWrap, key.familyVmkCheck);
    } catch {
      return { kind: "error", key: "joinLinkIncomplete" };
    }

    const personal = await personalKeyFor(deps, input.password);
    const acceptRes = await deps.api.request(`/api/invitations/${input.invitationId}/accept`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...(personal.created ? { userKeys: personal.created } : {}),
        memberVmkWrap: wrapVaultKeyForMember(vmk, personal.kemPublicKey),
      }),
    });
    if (!acceptRes.ok) return { kind: "error", key: joinErrorKey(await errorCode(acceptRes)) };
    const { accountId } = (await acceptRes.json()) as { accountId: string };

    await deps.dropFamilyData();
    deps.vault.getState().adoptMemberVault(vmk, personal.seed);
    return { kind: "joined", accountId };
  } catch {
    return { kind: "error", key: "joinFailed" };
  }
}

export interface JoinRegistrationInput {
  email: string;
  password: string;
  confirmPassword: string;
  invitationId: string;
  hasAcceptedTerms: boolean;
  captchaToken: string | null;
}

/**
 * A new login from an invitation, step one: ask the platform to register it
 * (no family of its own; it emails a code). The caller keeps the password in
 * memory for the join after the code.
 */
export async function startJoinRegistration(
  auth: AuthApi,
  input: JoinRegistrationInput,
): Promise<AuthMessageKey | "invitationInvalid" | null> {
  if (input.password !== input.confirmPassword) return "passwordsNoMatch";
  if (input.password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  if (!input.hasAcceptedTerms) return "termsRequired";
  try {
    const { error } = await auth.register(
      { email: input.email, password: input.password, familyInvitationId: input.invitationId },
      captchaHeaders(input.captchaToken),
    );
    if (!error) return null;
    if (error.code === "INVITATION_INVALID") return "invitationInvalid";
    if (isCaptchaError(error.code)) return "captchaFailed";
    return "genericSignupError";
  } catch {
    return "genericSignupError";
  }
}

/** Step two: the emailed code confirms the address and signs the new login in. */
export async function verifyJoinCode(
  auth: AuthApi,
  input: { email: string; code: string },
): Promise<AuthMessageKey | null> {
  const { error } = await auth.verifyEmail({ email: input.email, otp: input.code });
  return error ? otpErrorKey(error.code) : null;
}

/**
 * An existing login signs in to join: auth only. Its own vault (if it has a
 * family) is not opened here; joining opens the new family's.
 */
export async function signInToJoin(
  auth: AuthApi,
  input: { email: string; password: string; captchaToken: string | null },
): Promise<{ kind: "signed_in" } | { kind: "needs_code" } | { kind: "error"; key?: AuthMessageKey; message?: string }> {
  const { error } = await auth.signInEmail(
    { email: input.email, password: input.password },
    captchaHeaders(input.captchaToken),
  );
  if (!error) return { kind: "signed_in" };
  if (error.code === "EMAIL_NOT_VERIFIED") return { kind: "needs_code" };
  if (isCaptchaError(error.code)) return { kind: "error", key: "captchaFailed" };
  return { kind: "error", message: error.message ?? error.statusText ?? "" };
}
