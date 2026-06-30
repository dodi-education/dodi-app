import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Kid,
  KidInsert,
  KidUpdate,
} from "@dodi/types/database";

type Client = SupabaseClient<Database>;

export async function listKids(
  supabase: Client,
  accountId: string,
): Promise<Kid[]> {
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Kid[];
}

export async function getKid(
  supabase: Client,
  kidId: string,
): Promise<Kid | null> {
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("id", kidId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as Kid;
}

export async function createKid(
  supabase: Client,
  kid: KidInsert,
): Promise<Kid> {
  const { data, error } = await supabase
    .from("kids")
    .insert(kid)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Kid;
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
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Kid;
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
