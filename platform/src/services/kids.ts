import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Kid,
  KidInsert,
  KidUpdate,
} from "@dodi/types/database";

type Client = SupabaseClient<Database>;

/**
 * Kid read shape: the active persona travels with the kid ("data travels with
 * the row that owns it") as a slim embed via the active_persona_id FK, so
 * clients never fetch /api/personas just to label a kid. The heavy `soul` doc
 * is deliberately excluded — AI flows load the full persona at session start.
 */
const KID_SELECT =
  "*, active_persona:personas!kids_active_persona_id_fkey(id, name, account_id, is_system_default)";

/** Strip the raw FK — the read shape carries the embedded object instead. */
function toKid(row: unknown): Kid {
  const { active_persona_id: _fk, ...kid } = row as Kid & {
    active_persona_id?: string | null;
  };
  return kid as Kid;
}

export async function listKids(
  supabase: Client,
  accountId: string,
): Promise<Kid[]> {
  const { data, error } = await supabase
    .from("kids")
    .select(KID_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toKid);
}

export async function getKid(
  supabase: Client,
  kidId: string,
): Promise<Kid | null> {
  const { data, error } = await supabase
    .from("kids")
    .select(KID_SELECT)
    .eq("id", kidId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return toKid(data);
}

export async function createKid(
  supabase: Client,
  kid: KidInsert,
): Promise<Kid> {
  const { data, error } = await supabase
    .from("kids")
    .insert(kid)
    .select(KID_SELECT)
    .single();

  if (error) throw error;
  return toKid(data);
}

export async function updateKid(
  supabase: Client,
  kidId: string,
  updates: KidUpdate,
): Promise<Kid> {
  const { data, error } = await supabase
    .from("kids")
    .update(updates)
    .eq("id", kidId)
    .select(KID_SELECT)
    .single();

  if (error) throw error;
  return toKid(data);
}

export async function deleteKid(
  supabase: Client,
  kidId: string,
): Promise<void> {
  const { error } = await supabase
    .from("kids")
    .delete()
    .eq("id", kidId);

  if (error) throw error;
}
