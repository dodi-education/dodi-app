import Image from "next/image";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import { hasAnyProvider } from "@/lib/services/ai-providers";
import { DodiGreeting } from "@/components/dodi/dodi-greeting";

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

  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      {/* Dodi avatar — will be replaced with Lottie animation later */}
      <div className="relative h-48 w-48">
        <Image
          src="/images/dodi-full.png"
          alt="Dodi"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* Speech bubble with conditional greeting */}
      {profileId ? (
        <DodiGreeting
          profileId={profileId}
          profileName={profileName}
          hasProvider={hasProvider}
        />
      ) : (
        <div className="w-full max-w-xs rounded-2xl border border-dodi-200 bg-white p-4 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No profile selected
          </p>
        </div>
      )}
    </div>
  );
}
