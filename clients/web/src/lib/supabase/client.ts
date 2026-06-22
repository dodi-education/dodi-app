import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

export function createClient(): ReturnType<
  typeof createBrowserClient<Database>
> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
