"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/kid/profile-switcher";

export default function KidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();

  const kidNavItems: Array<{ href: string; label: string; icon: IconName }> = [
    { href: "/home", label: t("home"), icon: "home" },
    { href: "/games", label: t("games"), icon: "games" },
    { href: "/friends", label: t("friends"), icon: "friends" },
  ];

  function handleSwitchToParent() {
    document.cookie = "dodi-view=parent; path=/; max-age=86400";
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-dodi-50">
      {/* Kid header — minimal */}
      <header className="flex items-center justify-between px-4 py-3">
        <ProfileSwitcher />
        <button
          onClick={handleSwitchToParent}
          className="rounded-md px-2 py-1 text-xs text-dodi-400 transition-colors hover:bg-dodi-100 hover:text-dodi-600"
          aria-label="Switch to parent view"
        >
          {t("parent")}
        </button>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center px-4 pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-white/90 py-2 backdrop-blur-sm">
        {kidNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-xs transition-colors",
              isActive
                ? "text-dodi-600"
                : "text-muted-foreground hover:text-dodi-500",
            )}
          >
              <Icon name={item.icon} className="h-6 w-6" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
