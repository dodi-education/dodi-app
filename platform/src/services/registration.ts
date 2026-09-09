import { sql } from "kysely";

import type { RegistrationMode } from "@dodi/types/database";

import type { Db } from "@/lib/db";

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
 * Delegates to the is_invite_code_active SQL function so the lower(code) match
 * can't be turned into an ILIKE wildcard by user input. Requires the service db.
 */
export async function isInviteCodeActive(
  db: Db,
  code: string,
): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const { rows } = await sql<{ ok: boolean }>`
    select public.is_invite_code_active(${trimmed}) as ok
  `.execute(db);
  return rows[0]?.ok === true;
}
