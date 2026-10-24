import { NextResponse } from "next/server";

import { normalizeAgentScopes, type AgentScope } from "@dodi/protocol/agent-scopes";
import type { AccountMemberRole } from "@dodi/types/database";

import { resolveActiveMembership } from "@/services/account-members";
import { getActiveAgentClient } from "@/services/authorized-clients";

import { auth } from "./auth";
import { scopedDb, serviceDb, type Db } from "./db";
import { verifyDeviceBearer } from "./device-token";

export type AuthVia = "user" | "robot" | "agent";

export interface AuthContext {
  /** The family the request acts as. */
  accountId: string;
  /**
   * Database handle for this request:
   *  - user path: RLS-enforced, stamped with the account (see lib/db.ts)
   *  - device path: the BYPASSRLS service handle; callers scope every query
   *    to `accountId` themselves
   */
  db: Db;
  via: AuthVia;
  /**
   * What an agent device or a scoped family member (role `member`) was
   * granted; null for the owner, co-parents and robots, which are not
   * scope-limited.
   */
  scopes: ReadonlySet<AgentScope> | null;
  /** The device id a robot or agent bearer belongs to. */
  deviceId?: string;
  /** The login session of a user request (browsers and the app). */
  sessionId?: string;
  /** The login (auth user) behind a user request; one of the family's members. */
  userId?: string;
  /** That login's role in the family. */
  role?: AccountMemberRole;
}

/**
 * Agent access to a route. Agents are refused everywhere unless the route
 * opts in: `"any"` for routes every agent needs (whoami, its own vault wrap),
 * otherwise the scope the agent must hold.
 */
export interface AuthOptions {
  agentScope?: AgentScope | "any";
  /**
   * Scoped family members (role `member`) are refused everywhere unless the
   * route opts in, like agents: `"any"` for routes every member needs (their
   * account view, their keys, leaving), otherwise the scope they must hold.
   * Without it, a route's concrete `agentScope` applies to members too (an
   * `"any"` agent route is agent plumbing and stays closed to them).
   */
  memberScope?: AgentScope | "any";
  /**
   * A person's request: the roles allowed (default: every member). Device
   * requests are not affected; routes that must refuse them check `via`.
   */
  roles?: readonly AccountMemberRole[];
}

/** Thrown when a request can't be authenticated; carries the HTTP status. */
export class AuthError extends Error {
  readonly status: number = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/** Authenticated, but this caller may not use the route (an agent outside its scopes). */
export class ForbiddenError extends AuthError {
  override readonly status = 403;
  /** Machine-readable reason clients branch on (e.g. NO_FAMILY). */
  readonly code: string | undefined;
  constructor(message = "Forbidden", code?: string) {
    super(message);
    this.name = "ForbiddenError";
    this.code = code;
  }
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Bearer-only auth for every client. Resolves the request to an account and a
 * database handle:
 *  - user (web/native) → Better Auth session token (bearer plugin), looked up
 *    in auth_sessions, then the family the session acts as (account_members,
 *    re-checked on every request); queries run as that family and login (RLS
 *    enforced).
 *  - robot             → platform-signed device token; queries run via the
 *    service handle scoped to the account in app code.
 *  - agent (dodi CLI)   → the same device token, for a device paired as an
 *    agent. Default-deny: only routes that pass `agentScope` accept it, and
 *    only when the device holds that scope. Queries run as the account (RLS
 *    enforced), like a user's.
 */
export async function resolveAuth(
  request: Request,
  options: AuthOptions = {},
): Promise<AuthContext> {
  const token = readBearer(request);
  if (!token) throw new AuthError("Missing bearer token");

  // Device bearer (platform-signed, stateless): the robot and the CLI.
  const device = verifyDeviceBearer(token);
  if (device?.kind === "agent") {
    // Agents are re-checked against their row on every request, so a revoke,
    // an expiry or a narrowed grant takes effect at once rather than when the
    // 15-minute bearer runs out.
    const row = await getActiveAgentClient(
      serviceDb,
      device.accountId,
      device.deviceId,
    );
    if (!row)
      throw new AuthError("This agent connection was revoked or has expired");
    const scopes = new Set(row.scopes as AgentScope[]);
    const wanted = options.agentScope;
    if (!wanted) throw new ForbiddenError("Agents cannot use this route");
    if (wanted !== "any" && !scopes.has(wanted)) {
      throw new ForbiddenError(
        `This agent was not granted the "${wanted}" scope`,
      );
    }
    return {
      accountId: device.accountId,
      db: scopedDb(device.accountId),
      via: "agent",
      scopes,
      deviceId: device.deviceId,
    };
  }
  if (device) {
    // Queries run via the service handle and MUST be scoped to accountId in
    // app code (RLS is bypassed for this path).
    return {
      accountId: device.accountId,
      db: serviceDb,
      via: "robot",
      scopes: null,
      deviceId: device.deviceId,
    };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new AuthError("Invalid or expired token");

  const userId = session.user.id;
  const membership = await resolveActiveMembership(
    serviceDb,
    userId,
    session.session.id,
  );
  if (!membership) {
    throw new ForbiddenError("This login is not a member of a family", "NO_FAMILY");
  }
  if (options.roles && !options.roles.includes(membership.role)) {
    throw new ForbiddenError("Your role in this family cannot do this");
  }
  let memberScopes: ReadonlySet<AgentScope> | null = null;
  if (membership.role === "member") {
    memberScopes = new Set(normalizeAgentScopes(membership.scopes));
    const wanted =
      options.memberScope ??
      (options.agentScope && options.agentScope !== "any" ? options.agentScope : undefined);
    if (!wanted) throw new ForbiddenError("Your access to this family does not include this");
    if (wanted !== "any" && !memberScopes.has(wanted)) {
      throw new ForbiddenError(`Your access to this family does not include "${wanted}"`);
    }
  }

  return {
    accountId: membership.accountId,
    db: scopedDb(membership.accountId, userId),
    via: "user",
    scopes: memberScopes,
    sessionId: session.session.id,
    userId,
    role: membership.role,
  };
}

/** A person's login, whether or not it belongs to a family yet (joining one). */
export interface LoginContext {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Resolve a login session without requiring a family: for the routes that
 * let a login join one. Device bearers are refused.
 */
export async function resolveLogin(request: Request): Promise<LoginContext> {
  const token = readBearer(request);
  if (!token) throw new AuthError("Missing bearer token");
  if (verifyDeviceBearer(token)) {
    throw new ForbiddenError("Only a person's login can do this");
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new AuthError("Invalid or expired token");
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  };
}

/** Route helper for resolveLogin: the login or a 401/403 Response. */
export async function requireLogin(
  request: Request,
): Promise<LoginContext | NextResponse> {
  try {
    return await resolveLogin(request);
  } catch (error) {
    const res = unauthorizedResponse(error);
    if (res) return res;
    throw error;
  }
}

/** Helper: turn an AuthError into a JSON 401 (403 for ForbiddenError), rethrow anything else. */
export function unauthorizedResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    const code = error instanceof ForbiddenError ? error.code : undefined;
    return NextResponse.json(
      code ? { error: error.message, code } : { error: error.message },
      { status: error.status },
    );
  }
  return null;
}

/**
 * Route helper — resolve auth or return a 401 Response. Usage:
 *   const auth = await requireAuth(request);
 *   if (auth instanceof Response) return auth;
 *   const { accountId, db } = auth;
 *
 * Agents (the dodi CLI) get a 403 unless the route opts in:
 *   const auth = await requireAuth(request, { agentScope: "games" });
 */
export async function requireAuth(
  request: Request,
  options: AuthOptions = {},
): Promise<AuthContext | NextResponse> {
  try {
    return await resolveAuth(request, options);
  } catch (error) {
    const res = unauthorizedResponse(error);
    if (res) return res;
    throw error;
  }
}
