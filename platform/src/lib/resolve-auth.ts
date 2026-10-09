import { NextResponse } from "next/server";

import type { AgentScope } from "@dodi/protocol/agent-scopes";

import { getActiveAgentClient } from "@/services/authorized-clients";

import { auth } from "./auth";
import { scopedDb, serviceDb, type Db } from "./db";
import { verifyDeviceBearer } from "./device-token";

export type AuthVia = "user" | "robot" | "agent";

export interface AuthContext {
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
   * What an agent device was granted; null for users and robots, which are
   * not scope-limited.
   */
  scopes: ReadonlySet<AgentScope> | null;
  /** The device id a robot or agent bearer belongs to. */
  deviceId?: string;
  /** The login session of a user request (browsers and the app). */
  sessionId?: string;
}

/**
 * Agent access to a route. Agents are refused everywhere unless the route
 * opts in: `"any"` for routes every agent needs (whoami, its own vault wrap),
 * otherwise the scope the agent must hold.
 */
export interface AuthOptions {
  agentScope?: AgentScope | "any";
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
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
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
 *    in auth_sessions; queries run as the user (RLS enforced).
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

  return {
    accountId: session.user.id,
    db: scopedDb(session.user.id),
    via: "user",
    scopes: null,
    sessionId: session.session.id,
  };
}

/** Helper: turn an AuthError into a JSON 401 (403 for ForbiddenError), rethrow anything else. */
export function unauthorizedResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
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
