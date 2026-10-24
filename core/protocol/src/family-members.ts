/**
 * Wire contract for family members (platform ↔ clients): personal keys,
 * invitations and the unlock keys a person opens their family's vault with.
 * The server validates structure only; every key in here is opaque to it.
 */
import { z } from "zod/v4";

import type { KemWrappedKey } from "@dodi/crypto";
import type { StoredUserKeys, StoredVaultKeys } from "@dodi/vault";

import { AGENT_SCOPES, normalizeAgentScopes, type AgentScope } from "./agent-scopes";
import { KemWrappedKeySchema, StoredVaultKeysSchema } from "./schemas";

/** Roles another adult can be invited into a family with. */
export const INVITABLE_ROLES = ["co_parent", "member"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Days an invitation link stays valid. */
export const INVITATION_TTL_DAYS = 7;

export const StoredUserKeysSchema = z.object({
  kemPublicKey: z.string().min(1).max(4000),
  signPublicKey: z.string().min(1).max(4000),
  vaultKeys: StoredVaultKeysSchema,
});

/** What a scoped member may do: the agent scope vocabulary. */
export const MemberScopesSchema = z.array(z.enum(AGENT_SCOPES)).max(AGENT_SCOPES.length);

/**
 * The scopes a role keeps: a `member` needs at least one, the owner and
 * co-parents have full access and none. Null when a member would get none.
 */
export function scopesForRole(
  role: "owner" | InvitableRole,
  scopes: readonly string[] | undefined,
): AgentScope[] | null {
  if (role !== "member") return [];
  const normalized = normalizeAgentScopes(scopes ?? []);
  return normalized.length > 0 ? normalized : null;
}

/** POST /api/account/invitations */
export const CreateInvitationBodySchema = z.object({
  email: z.email().max(320),
  role: z.enum(INVITABLE_ROLES),
  /** Role `member`: what they may do (at least one). Ignored for co-parents. */
  scopes: MemberScopesSchema.optional(),
  /** The family's VMK sealed under the link secret (member-keys createInviteWrap). */
  vmkInviteWrap: z.string().min(1).max(4000),
});
export type CreateInvitationBody = z.infer<typeof CreateInvitationBodySchema>;

/** PATCH /api/account/members/{userId}: change a non-owner's role and scopes. */
export const UpdateMemberBodySchema = z.object({
  role: z.enum(INVITABLE_ROLES),
  scopes: MemberScopesSchema.optional(),
});

/** POST /api/invitations/{id}/accept */
export const AcceptInvitationBodySchema = z.object({
  /** A login without a personal key yet sends the new one (also a re-key). */
  userKeys: StoredUserKeysSchema.optional(),
  /** The family's VMK wrapped to the member's personal KEM key. */
  memberVmkWrap: KemWrappedKeySchema,
});
export type AcceptInvitationBody = z.infer<typeof AcceptInvitationBodySchema>;

/** PUT /api/user-keys: the login's wraps after a password change or a new device. */
export const PutUserKeysBodySchema = z.object({ vaultKeys: StoredVaultKeysSchema });

/** POST /api/vault/device-wraps: one more device (agent, robot) on the family's vault. */
export const AppendDeviceWrapBodySchema = z.object({
  deviceId: z.string().min(1).max(200),
  deviceKemPublicKey: z.string().min(1).max(4000),
  wrapped: KemWrappedKeySchema,
});

/**
 * GET /api/vault/unlock-keys: what the signed-in person opens their family's
 * vault with. The owner: the family's own blob. Anyone else: their personal
 * key and the family's VMK wrapped to it, plus the family's `vmkCheck`.
 */
export type UnlockKeys =
  | { kind: "account"; keys: StoredVaultKeys | null }
  | {
      kind: "member";
      userKeys: StoredUserKeys | null;
      memberWrap: KemWrappedKey | null;
      familyVmkCheck: string | null;
    };

/** GET /api/invitations/{id}: what the join page shows before sign-in. */
export interface InvitationPreview {
  id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedEmail: string;
  role: InvitableRole;
  scopes: string[];
  inviterEmail: string | null;
  expiresAt: string;
}

/** GET /api/invitations/{id}/key: the sealed VMK, for the invited login only. */
export interface InvitationKey {
  vmkInviteWrap: string;
  familyVmkCheck: string;
}

/** A pending invitation in the Access list. */
export interface PendingInvitation {
  id: string;
  invitedEmail: string;
  role: InvitableRole;
  scopes: string[];
  invitedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
}

/** A person in the Access list. */
export interface FamilyMember {
  userId: string;
  email: string;
  role: "owner" | "co_parent" | "member";
  /** Role `member` only. */
  scopes: string[];
  joinedAt: string;
  isYou: boolean;
}
