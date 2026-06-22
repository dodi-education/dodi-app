import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Profile,
  ProfileInsert,
  ProfileUpdate,
} from "@/types/database";

type Client = SupabaseClient<Database>;

export async function listProfiles(
  supabase: Client,
  accountId: string,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

export async function getProfile(
  supabase: Client,
  profileId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as Profile;
}

export async function createProfile(
  supabase: Client,
  profile: ProfileInsert,
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .insert(profile)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Profile;
}

export async function updateProfile(
  supabase: Client,
  profileId: string,
  updates: ProfileUpdate,
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profileId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Profile;
}

export async function deleteProfile(
  supabase: Client,
  profileId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId);

  if (error) throw error;
}
