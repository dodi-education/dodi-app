import { DodiClient } from "@dodi/protocol";

import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/**
 * Browser API client for the Dodi platform (platform.dodi.app). Pure client: all data
 * goes through the platform HTTP API, authenticated with the user's Supabase
 * access token as a bearer (no cookies cross to the API origin). `baseUrl` is
 * env-driven (NEXT_PUBLIC_API_URL); empty = same-origin (dev fallback).
 */
export const dodi = new DodiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  auth: {
    kind: "bearer",
    getToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? "";
    },
  },
});
