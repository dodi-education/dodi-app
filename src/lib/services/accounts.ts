import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;
type Account = Database["public"]["Tables"]["accounts"]["Row"];
type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

export async function getAccount(
  supabase: Client,
  accountId: string,
): Promise<Account | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  // Type assertion needed until types are auto-generated from Supabase
  return data as unknown as Account;
}

export async function updateAccount(
  supabase: Client,
  accountId: string,
  updates: AccountUpdate,
): Promise<Account> {
  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", accountId)
    .select()
    .single();

  if (error) throw error;
  // Type assertion needed until types are auto-generated from Supabase
  return data as unknown as Account;
}
