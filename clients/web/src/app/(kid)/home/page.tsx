import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@dodi/platform/services/profiles";
import { hasAnyProvider } from "@dodi/platform/services/ai-providers";
import { DodiFullHome } from "@/components/dodi/dodi-full-home";

export default async function KidHomePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const profileId = cookieStore.get("dodi-active-profile")?.value;

  let hasProvider = false;

  if (profileId) {
    const profile = await getProfile(supabase, profileId);
    if (profile) {
      // display_name is decrypted client-side in DodiFullHome (E2EE).
      hasProvider = await hasAnyProvider(supabase, profile.account_id);
    }
  }

  if (!profileId) {
    return (
      <div className="my-auto w-full max-w-xs rounded-[20px] bg-white p-5 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <p className="text-sm font-bold text-muted-foreground">
          No profile selected
        </p>
      </div>
    );
  }

  return (
    <DodiFullHome
      profileId={profileId}
      hasProvider={hasProvider}
    />
  );
}
