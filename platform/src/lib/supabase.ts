import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const NO_SESSION = { persistSession: false, autoRefreshToken: false } as const;

/** Anon client, used only to validate a bearer token via getUser(jwt). */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: NO_SESSION,
  });
}

/**
 * A client that runs queries AS the user by forwarding their access token, so
 * RLS (`auth.uid() = account_id`) still applies to user-authenticated requests.
 */
export function userClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: NO_SESSION,
  });
}

/**
 * Service-role client for cross-account operations (devices, friends) and
 * device-authenticated requests. RLS is bypassed, so every query MUST be scoped
 * to the resolved account_id in app code.
 */
export function serviceClient(): SupabaseClient<Database> {
  // Supabase "secret" key (sb_secret_…): bypasses RLS, so keep it server-only.
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set on the platform server. It is required for " +
        "cross-account operations (friend discovery/requests, device pairing). " +
        "Add it to platform/.env.local and restart the platform server.",
    );
  }
  return createClient<Database>(SUPABASE_URL, secretKey, { auth: NO_SESSION });
}
