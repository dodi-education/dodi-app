import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, RegistrationMode } from "@dodi/types/database";

type Client = SupabaseClient<Database>;

const MODES: readonly RegistrationMode[] = ["open", "invite", "closed"];

/**
 * The registration gate, from the REGISTRATION_MODE env var. Unset or invalid
 * values fall back to "open" (validate-with-fallback, mirroring logger.ts).
 * Read server-side only; the client learns the mode via /api/auth/registration-status.
 */
export function getRegistrationMode(): RegistrationMode {
  const raw = process.env.REGISTRATION_MODE?.trim().toLowerCase() ?? "";
  return (MODES as readonly string[]).includes(raw)
    ? (raw as RegistrationMode)
    : "open";
}

/**
 * Whether an active invite code with this value exists (case-insensitive).
 * Delegates to the is_invite_code_active RPC so the lower(code) match can't be
 * turned into an ILIKE wildcard by user input. Requires a service-role client.
 */
export async function isInviteCodeActive(
  supabase: Client,
  code: string,
): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const { data, error } = await supabase.rpc("is_invite_code_active", {
    p_code: trimmed,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
