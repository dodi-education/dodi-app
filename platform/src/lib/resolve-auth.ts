import { NextResponse } from "next/server";

import { auth } from "./auth";
import { scopedDb, serviceDb, type Db } from "./db";
import { verifyDeviceBearer } from "./device-token";

export type AuthVia = "user" | "device";

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
}

/** Thrown when a request can't be authenticated; carries the HTTP status. */
export class AuthError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
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
 *  - device (agent)    → platform-signed device token; queries run via the
 *    service handle scoped to the account in app code.
 */
export async function resolveAuth(request: Request): Promise<AuthContext> {
  const token = readBearer(request);
  if (!token) throw new AuthError("Missing bearer token");

  // Device bearer (platform-signed, stateless): the agent and other headless
  // clients. Queries run via the service handle and MUST be scoped to
  // accountId in app code (RLS is bypassed for this path).
  const device = verifyDeviceBearer(token);
  if (device) {
    return { accountId: device.accountId, db: serviceDb, via: "device" };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new AuthError("Invalid or expired token");

  return {
    accountId: session.user.id,
    db: scopedDb(session.user.id),
    via: "user",
  };
}

/** Helper: turn an AuthError into a JSON 401, rethrow anything else. */
export function unauthorizedResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/**
 * Route helper — resolve auth or return a 401 Response. Usage:
 *   const auth = await requireAuth(request);
 *   if (auth instanceof Response) return auth;
 *   const { accountId, db } = auth;
 */
export async function requireAuth(
  request: Request,
): Promise<AuthContext | NextResponse> {
  try {
    return await resolveAuth(request);
  } catch (error) {
    const res = unauthorizedResponse(error);
    if (res) return res;
    throw error;
  }
}
