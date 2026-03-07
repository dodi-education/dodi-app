import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import { hasAnyProvider } from "@/lib/services/ai-providers";
import { DodiFullHome } from "@/components/dodi/dodi-full-home";

export default async function KidHomePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const profileId = cookieStore.get("dodi-active-profile")?.value;

  let profileName = "";
  let hasProvider = false;

  if (profileId) {
    const profile = await getProfile(supabase, profileId);
    if (profile) {
      profileName = profile.display_name;
      hasProvider = await hasAnyProvider(supabase, profile.account_id);
    }
  }

  if (!profileId) {
    return (
      <div className="w-full max-w-xs rounded-2xl border border-dodi-200 bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          No profile selected
        </p>
      </div>
    );
  }

  return (
    <DodiFullHome
      profileId={profileId}
      profileName={profileName}
      hasProvider={hasProvider}
    />
  );
}
