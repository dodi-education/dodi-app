"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSwitchToKid() {
    // Fetch profiles to resolve active profile's language
    const response = await fetch("/api/profiles");
    if (response.ok) {
      const profiles = await response.json();
      if (profiles.length > 0) {
        // Keep the last-used profile if it still exists, otherwise default to first
        const existing = document.cookie.match(/(?:^|; )dodi-active-profile=([^;]*)/);
        const lastUsedId = existing ? decodeURIComponent(existing[1]) : null;
        const profile = profiles.find((p: { id: string }) => p.id === lastUsedId) ?? profiles[0];
        document.cookie = `dodi-active-profile=${profile.id}; path=/; max-age=86400`;
        const kidLocale = profile.language ?? "en";
        document.cookie = `dodi-kid-locale=${kidLocale}; path=/; max-age=86400`;
      }
    }
    document.cookie = "dodi-view=kid; path=/; max-age=86400";
    router.push("/home");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
        <Image
          src="/images/dodi-head-active.png"
          alt="Dodi"
          width={28}
          height={28}
        />
        <span className="font-bold text-dodi-800">Dodi</span>
      </Link>

      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button variant="outline" size="sm" onClick={handleSwitchToKid}>
          {t("kidView")}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          {tc("signOut")}
        </Button>
      </div>
    </header>
  );
}
