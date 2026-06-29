"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { clearParentUnlocked } from "@/lib/parent-lock";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const tc = useTranslations("common");
  const router = useRouter();

  async function handleSignOut() {
    clearParentUnlocked();
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
