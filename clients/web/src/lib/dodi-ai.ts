import { createClient } from "@/lib/supabase/client";
import { API_VERSION, VERSION_HEADER } from "@dodi/billing-contract";

// Lazy: building the Supabase client needs env at construction time, and this
// module is imported from AI-resolution code that unit tests load without env.
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase(): ReturnType<typeof createClient> {
  if (!supabase) supabase = createClient();
  return supabase;
}

/**
 * Client for the commercial dodi AI control plane (ai.dodi.app — dodi-com,
 * NOT the OSS platform). Same Supabase login: requests carry the platform
 * access token as a bearer.
 *
 * `NEXT_PUBLIC_DODI_AI_URL` unset ⇒ self-host mode: every dodi AI surface is
 * hidden and no request is ever made (PROJECT.md: "Self-host / no cloud AI
 * URL → hide top-up and dodi AI; BYOK only").
 */
export function isDodiAIConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DODI_AI_URL);
}

export async function dodiAIRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_DODI_AI_URL;
  if (!base) throw new Error("dodi AI is not configured (NEXT_PUBLIC_DODI_AI_URL)");
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: API_VERSION,
      ...(init.headers ?? {}),
    },
  });
}
