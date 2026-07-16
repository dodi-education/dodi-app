"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { clearParentUnlocked } from "@/lib/parent-lock";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/stores/account-store";
import { useKidStore } from "@/stores/kid-store";

export function SignOutButton() {
  const tc = useTranslations("common");
  const router = useRouter();

  async function handleSignOut() {
    clearParentUnlocked();
    // Sign-out is an SPA navigation — drop the in-memory caches so a
    // subsequent login (possibly another account) never sees stale data.
    useAccountStore.getState().reset();
    useKidStore.getState().invalidate();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      title={tc("signOut")}
      aria-label={tc("signOut")}
      className="flex rounded p-1 text-faint transition-colors hover:text-danger"
    >
      <Icon name="logout" size={15} />
    </button>
  );
}
