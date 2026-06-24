import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";

import { verifyDeviceBearer } from "./device-token";
import { anonClient, serviceClient, userClient } from "./supabase";

export type AuthVia = "user" | "device";

export interface AuthContext {
  accountId: string;
  supabase: SupabaseClient<Database>;
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
 * scoped Supabase client:
 *  - user (web/native) → Supabase access-token JWT, validated statelessly via
 *    getUser(); queries run as the user (RLS enforced).
 *  - device (agent)    → platform-signed device token (added in P7.5); queries
 *    run via the service-role client scoped to the account in app code.
 */
export async function resolveAuth(request: Request): Promise<AuthContext> {
  const token = readBearer(request);
  if (!token) throw new AuthError("Missing bearer token");

  // Device bearer (platform-signed, stateless): the agent and other headless
  // clients. Queries run via the service-role client and MUST be scoped to
  // accountId in app code (RLS is bypassed for this path).
  const device = verifyDeviceBearer(token);
  if (device) {
    return {
      accountId: device.accountId,
      supabase: serviceClient(),
      via: "device",
    };
  }

  // User JWT (web/native): validated statelessly; queries run as the user (RLS).
  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data.user) throw new AuthError("Invalid or expired token");

  return {
    accountId: data.user.id,
    supabase: userClient(token),
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
 *   const { accountId, supabase } = auth;
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
