"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { AccountBadge } from "@/components/parent/account-badge";
import { BackLink } from "@/components/parent/back-link";
import { KidViewButton } from "@/components/parent/kid-view-button";
import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

interface SettingsNavItem {
  href: string;
  label: string;
  icon: IconName;
}

function useSettingsNav(): SettingsNavItem[] {
  const t = useTranslations("settings");
  return [
    { href: "/parent/settings/general", label: t("navGeneral"), icon: "settings" },
    {
      href: "/parent/settings/notifications",
      label: t("navNotifications"),
      icon: "bell",
    },
    { href: "/parent/settings/security", label: t("navSecurity"), icon: "lock" },
    {
      href: "/parent/settings/ai-providers",
      label: t("navAiProviders"),
      icon: "sparkles",
    },
    { href: "/parent/settings/devices", label: t("navDevices"), icon: "qrcode" },
  ];
}

/** Active/inactive tokens mirror SidebarNav so the two rails read identically. */
const itemActive = "bg-primary-soft font-semibold text-primary";
const itemInactive = "font-medium text-ink-2 hover:bg-foreground/5";

/**
 * Settings sub-navigation. In `wide` it is a fixed overlay rail that slides in
 * over the main sidebar (which stays mounted underneath, preserving the content
 * offset). In `compact` it degrades to a horizontally scrollable tab strip
 * rendered above the section content.
 */
export function SettingsSidebar() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const items = useSettingsNav();

  return (
    <>
      {/* wide: fixed overlay rail painted on top of the main sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 hidden h-screen w-56 flex-col border-r bg-sidebar px-3 pt-5 pb-4",
          "shadow-[0_18px_50px_rgba(34,56,78,0.22)]",
          "animate-in fade-in-0 slide-in-from-left-4 duration-300",
          "wide:flex",
        )}
      >
        <div className="px-2.5 pb-4">
          <BackLink href="/parent/dashboard">{t("back")}</BackLink>
          <span className="block text-[17px] font-bold tracking-tight">
            {t("title")}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  isActive ? itemActive : itemInactive,
                )}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2.5 pt-3">
          <KidViewButton />
          <AccountBadge />
        </div>
      </aside>

      {/* compact: sub-tab strip above the section content */}
      <div className="mb-5 wide:hidden">
        <BackLink href="/parent/dashboard">{t("back")}</BackLink>
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors",
                  isActive ? itemActive : itemInactive,
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
