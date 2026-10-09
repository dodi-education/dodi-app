import { generateSocialId } from "@dodi/crypto/social-id";
import {
  normalizeAgentScopes,
  type AgentScope,
} from "@dodi/protocol/agent-scopes";
import { clientLabelFromUserAgent } from "@dodi/protocol/client-label";
import type {
  AuthorizedClient,
  AuthorizedClientKind,
  AuthorizedClientStatus,
  AuthorizedClientUpdate,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";

import { removeDeviceWrap } from "./vault-keys";

/**
 * Everything that can open a family's vault (authorized_clients): browsers and
 * the app (registered when they add their own vault wrap), the robot and
 * agents (paired: enroll → the parent claims the code → activate). The wraps
 * themselves live in accounts.vault_keys, joined by device_id; revoking a
 * client drops its wrap, its status and its login session in one step.
 */

export interface EnrollInput {
  deviceId: string;
  kemPublicKey: string;
  signPublicKey: string;
  name?: string | null;
  /** "agent" for the dodi CLI; robots omit it. */
  kind?: "robot" | "agent";
  /** Agent only: the scopes the CLI asks for (the parent may narrow them). */
  scopes?: readonly string[];
}

/** What the parent decides when approving an agent. */
export interface AgentGrant {
  scopes: readonly string[];
  /** Days until the connection stops working; null = never. */
  expiresInDays: number | null;
}

/** The longest an agent connection may live, in days. */
export const MAX_AGENT_EXPIRY_DAYS = 365;

/** One entry of the Access list. */
export interface AuthorizedClientView {
  /** The row id, or the login session id for a session that never registered. */
  id: string;
  kind: AuthorizedClientKind;
  status: AuthorizedClientStatus;
  /** Agents and robots: the name they enrolled with. */
  name: string | null;
  /** Browsers and the app: "Firefox on Linux". */
  label: string | null;
  scopes: string[];
  expires_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  /** Holds a copy of the vault key (a signed-in but never unlocked session does not). */
  has_vault_access: boolean;
  /** The client making this request. */
  is_current: boolean;
}

/** Create a pending (unclaimed) robot or agent with a short pairing code. Service-role. */
export async function createPendingClient(
  db: Db,
  input: EnrollInput,
): Promise<{ id: string; pairingCode: string }> {
  const pairingCode = generateSocialId(8);
  const kind = input.kind ?? "robot";
  const { id } = await db
    .insertInto("authorized_clients")
    .values({
      device_id: input.deviceId,
      kem_public_key: input.kemPublicKey,
      sign_public_key: input.signPublicKey,
      name: input.name?.slice(0, 80) ?? null,
      status: "pending",
      pairing_code: pairingCode,
      kind,
      scopes: kind === "agent" ? normalizeAgentScopes(input.scopes ?? []) : [],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id, pairingCode };
}

/** Claim a pending robot or agent by pairing code, binding it to the account. Service-role. */
export async function claimClient(
  db: Db,
  pairingCode: string,
  accountId: string,
): Promise<AuthorizedClient> {
  const found = await db
    .selectFrom("authorized_clients")
    .selectAll()
    .where("pairing_code", "=", pairingCode)
    .where("status", "=", "pending")
    .where("account_id", "is", null)
    .executeTakeFirst();
  if (!found) throw new Error("No pending client for that pairing code");

  return db
    .updateTable("authorized_clients")
    .set({ account_id: accountId, pairing_code: null })
    .where("id", "=", found.id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** The agent scopes the parent sees on the approval screen, for a claimed agent. */
export function requestedScopes(
  client: Pick<AuthorizedClient, "kind" | "scopes">,
): AgentScope[] {
  return client.kind === "agent" ? normalizeAgentScopes(client.scopes) : [];
}

/**
 * Activate a claimed robot or agent. An agent needs the parent's grant: the
 * granted scopes are intersected with what the CLI asked for (a parent can
 * narrow a request, never widen it) and the expiry is stamped from now.
 */
export async function activateClient(
  db: Db,
  accountId: string,
  id: string,
  grant?: AgentGrant,
  now: Date = new Date(),
): Promise<AuthorizedClient> {
  const client = await db
    .selectFrom("authorized_clients")
    .select(["kind", "scopes", "status"])
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!client || client.status !== "pending")
    throw new Error("No pending client to activate");
  if (client.kind !== "robot" && client.kind !== "agent")
    throw new Error("Only paired clients are activated");

  const update: AuthorizedClientUpdate = {
    status: "active",
    enrolled_at: now.toISOString(),
  };
  if (client.kind === "agent") {
    if (!grant) throw new Error("An agent needs the granted scopes and expiry");
    const requested = new Set(client.scopes);
    update.scopes = normalizeAgentScopes(grant.scopes).filter((s) =>
      requested.has(s),
    );
    const days = grant.expiresInDays;
    if (
      days != null &&
      (!Number.isInteger(days) || days < 1 || days > MAX_AGENT_EXPIRY_DAYS)
    ) {
      throw new Error(`Expiry must be 1 to ${MAX_AGENT_EXPIRY_DAYS} days`);
    }
    update.expires_at =
      days == null
        ? null
        : new Date(now.getTime() + days * 86_400_000).toISOString();
  }
  return db
    .updateTable("authorized_clients")
    .set(update)
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface AccessKeyInput {
  deviceId: string;
  kemPublicKey: string;
  signPublicKey: string;
  name: string;
  scopes: readonly string[];
  expiresInDays: number | null;
}

/**
 * An access key (Settings > Access > Create access key): the parent's own
 * browser derived the agent from a seed it shows once, so there is no request
 * to approve. The agent is created already active with the granted scopes.
 * The browser stores the agent's vault wrap before calling this.
 */
export async function createAccessKeyClient(
  db: Db,
  accountId: string,
  input: AccessKeyInput,
  now: Date = new Date(),
): Promise<AuthorizedClient> {
  const days = input.expiresInDays;
  if (
    days != null &&
    (!Number.isInteger(days) || days < 1 || days > MAX_AGENT_EXPIRY_DAYS)
  ) {
    throw new Error(`Expiry must be 1 to ${MAX_AGENT_EXPIRY_DAYS} days`);
  }
  return db
    .insertInto("authorized_clients")
    .values({
      account_id: accountId,
      device_id: input.deviceId,
      kem_public_key: input.kemPublicKey,
      sign_public_key: input.signPublicKey,
      name: input.name.slice(0, 80),
      kind: "agent",
      status: "active",
      scopes: normalizeAgentScopes(input.scopes),
      expires_at:
        days == null
          ? null
          : new Date(now.getTime() + days * 86_400_000).toISOString(),
      enrolled_at: now.toISOString(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface RegisterOwnClientInput {
  deviceId: string;
  kemPublicKey: string;
  kind: "browser" | "app";
  label: string | null;
  sessionId: string | null;
}

/**
 * A browser or the app records itself after adding its own vault wrap (and
 * on later unlocks, to refresh its label, session and last use). Upsert by
 * device id; never takes over a paired robot or agent row.
 */
export async function registerOwnClient(
  db: Db,
  accountId: string,
  input: RegisterOwnClientInput,
  now: Date = new Date(),
): Promise<void> {
  const values = {
    kind: input.kind,
    kem_public_key: input.kemPublicKey,
    label: input.label?.slice(0, 80) ?? null,
    session_id: input.sessionId,
    status: "active" as const,
    last_seen_at: now.toISOString(),
  };
  await db
    .insertInto("authorized_clients")
    .values({
      ...values,
      account_id: accountId,
      device_id: input.deviceId,
      enrolled_at: now.toISOString(),
    })
    .onConflict((oc) =>
      oc
        .columns(["account_id", "device_id"])
        .doUpdateSet(values)
        .where("authorized_clients.kind", "in", ["browser", "app"]),
    )
    .execute();
}

/**
 * The Access list: every client that is not revoked, plus login sessions
 * that never registered (signed in but never unlocked: no vault access).
 * `serviceDb` reads the account's own sessions (auth tables have no RLS
 * policies for the app role); `db` reads the clients through RLS.
 */
export async function listAuthorizedClients(
  db: Db,
  serviceDb: Db,
  accountId: string,
  current: { sessionId?: string | null; deviceId?: string | null } = {},
  now: Date = new Date(),
): Promise<AuthorizedClientView[]> {
  const rows = await db
    .selectFrom("authorized_clients")
    .selectAll()
    .where("account_id", "=", accountId)
    .where("status", "!=", "revoked")
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();
  const sessions = await serviceDb
    .selectFrom("auth_sessions")
    .select(["id", "user_agent", "created_at", "updated_at"])
    .where("user_id", "=", accountId)
    .where("expires_at", ">", now.toISOString())
    .orderBy("updated_at", "desc")
    .limit(100)
    .execute();
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const linked = new Set(rows.map((row) => row.session_id).filter(Boolean));

  const clients: AuthorizedClientView[] = rows.map((row) => {
    const session = row.session_id
      ? sessionsById.get(row.session_id)
      : undefined;
    const isExpired =
      row.expires_at != null && row.expires_at <= now.toISOString();
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      name: row.name,
      label: row.label,
      scopes: row.scopes,
      expires_at: row.expires_at,
      last_seen_at: session?.updated_at ?? row.last_seen_at,
      created_at: row.created_at,
      has_vault_access: row.status === "active" && !isExpired,
      is_current:
        (current.deviceId != null && row.device_id === current.deviceId) ||
        (current.sessionId != null && row.session_id === current.sessionId),
    };
  });
  for (const session of sessions) {
    if (linked.has(session.id)) continue;
    clients.push({
      id: session.id,
      kind: "browser",
      status: "active",
      name: null,
      label: clientLabelFromUserAgent(session.user_agent),
      scopes: [],
      expires_at: null,
      last_seen_at: session.updated_at,
      created_at: session.created_at,
      has_vault_access: false,
      is_current: current.sessionId === session.id,
    });
  }
  return clients;
}

export type RevokeOutcome =
  { revoked: true; wasCurrent: boolean } | { revoked: false };

/**
 * Revoke one entry of the Access list in one step: drop its vault wrap, mark
 * it revoked and delete its login session. A pending (never approved) client
 * is simply deleted. An `id` that is a bare login session ends that session.
 */
export async function revokeClient(
  db: Db,
  serviceDb: Db,
  accountId: string,
  id: string,
  current: { sessionId?: string | null } = {},
): Promise<RevokeOutcome> {
  const client = await db
    .selectFrom("authorized_clients")
    .select(["id", "device_id", "status", "session_id"])
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .executeTakeFirst();

  if (!client) {
    const ended = await serviceDb
      .deleteFrom("auth_sessions")
      .where("id", "=", id)
      .where("user_id", "=", accountId)
      .executeTakeFirst();
    return Number(ended.numDeletedRows) > 0
      ? { revoked: true, wasCurrent: current.sessionId === id }
      : { revoked: false };
  }

  if (client.status === "pending") {
    await db
      .deleteFrom("authorized_clients")
      .where("id", "=", id)
      .where("account_id", "=", accountId)
      .execute();
    return { revoked: true, wasCurrent: false };
  }

  // Wrap first: once it is gone the client cannot open the vault, whatever
  // happens to the rest.
  await removeDeviceWrap(db, accountId, client.device_id);
  await db
    .updateTable("authorized_clients")
    .set({ status: "revoked", session_id: null })
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .execute();
  if (client.session_id) {
    await serviceDb
      .deleteFrom("auth_sessions")
      .where("id", "=", client.session_id)
      .where("user_id", "=", accountId)
      .execute();
  }
  return {
    revoked: true,
    wasCurrent:
      client.session_id != null && client.session_id === current.sessionId,
  };
}

/** An agent disconnecting itself: the same one-step revoke, found by its device id. */
export async function revokeOwnAgent(
  db: Db,
  serviceDb: Db,
  accountId: string,
  deviceId: string,
): Promise<void> {
  const row = await db
    .selectFrom("authorized_clients")
    .select("id")
    .where("device_id", "=", deviceId)
    .where("account_id", "=", accountId)
    .where("kind", "=", "agent")
    .executeTakeFirst();
  if (row) await revokeClient(db, serviceDb, accountId, row.id);
}

/**
 * The active, unexpired agent behind an agent bearer, or null when it was
 * revoked, expired or never was an agent. Service-role (runs before the
 * request has an account handle), so it is scoped to the account explicitly.
 */
export async function getActiveAgentClient(
  db: Db,
  accountId: string,
  deviceId: string,
  now: Date = new Date(),
): Promise<Pick<AuthorizedClient, "id" | "scopes" | "name"> | null> {
  const row = await db
    .selectFrom("authorized_clients")
    .select(["id", "scopes", "name"])
    .where("device_id", "=", deviceId)
    .where("account_id", "=", accountId)
    .where("kind", "=", "agent")
    .where("status", "=", "active")
    .where((eb) =>
      eb.or([
        eb("expires_at", "is", null),
        eb("expires_at", ">", now.toISOString()),
      ]),
    )
    .executeTakeFirst();
  return row ?? null;
}

/**
 * An active, unexpired robot or agent by its device id (for challenge/token:
 * browsers and the app never get device bearers). Service-role.
 */
export async function getActivePairedClient(
  db: Db,
  deviceId: string,
  now: Date = new Date(),
): Promise<AuthorizedClient | null> {
  const row = await db
    .selectFrom("authorized_clients")
    .selectAll()
    .where("device_id", "=", deviceId)
    .where("status", "=", "active")
    .where("kind", "in", ["robot", "agent"])
    .where((eb) =>
      eb.or([
        eb("expires_at", "is", null),
        eb("expires_at", ">", now.toISOString()),
      ]),
    )
    .executeTakeFirst();
  return row ?? null;
}

/** Best-effort last-seen stamp: a failure never blocks token issuance. */
export async function touchLastSeen(db: Db, id: string): Promise<void> {
  try {
    await db
      .updateTable("authorized_clients")
      .set({ last_seen_at: new Date().toISOString() })
      .where("id", "=", id)
      .execute();
  } catch {
    // Ignored on purpose.
  }
}
