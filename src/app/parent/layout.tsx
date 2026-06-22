import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { KidViewButton } from "@/components/parent/kid-view-button";
import { SignOutButton } from "@/components/parent/sign-out-button";
import { BottomNav, SidebarNav } from "@/components/shared/sidebar-nav";
import { VaultGate } from "@/components/vault/vault-gate";
import { getAccount } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("settings");
  const account = await getAccount(supabase, user.id).catch(() => null);
  const tier = account?.subscription_tier ?? "free";
  const initial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar px-3 pt-5 pb-4 md:flex md:sticky md:top-0 md:h-screen">
        <Link
          href="/parent/dashboard"
          className="flex items-center gap-2.5 px-2.5 pb-4"
        >
          <Image
            src="/images/dodi-head-active.png"
            alt="Dodi"
            width={30}
            height={30}
          />
          <span className="text-[17px] font-bold tracking-tight">Dodi</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="mt-auto flex flex-col gap-2.5 pt-3">
          <KidViewButton />
          <div className="flex items-center gap-2 border-t pt-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft-2 text-xs font-bold text-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold">
                {user.email}
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                {t("tierLabel", {
                  tier: tier.charAt(0).toUpperCase() + tier.slice(1),
                })}
              </div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b bg-sidebar px-4 md:hidden">
        <Link href="/parent/dashboard" className="flex items-center gap-2">
          <Image
            src="/images/dodi-head-active.png"
            alt="Dodi"
            width={28}
            height={28}
          />
          <span className="font-bold">Dodi</span>
        </Link>
        <div className="flex items-center gap-2">
          <KidViewButton compact />
          <SignOutButton />
        </div>
      </header>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">
          <div className="max-w-[880px] px-5 py-7 pb-20 md:px-12 md:py-9">
            <VaultGate>{children}</VaultGate>
          </div>
        </main>
        {/* Mobile bottom nav */}
        <div className="sticky bottom-0 md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
