"use client";

import { SETTINGS_NAV } from "@dodi/client-state/parent-nav";
import { settingsTab } from "@dodi/ui-recipes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { AccountBadge } from "@/components/parent/account-badge";
import { BackLink } from "@/components/parent/back-link";
import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

interface SettingsNavItem {
  href: string;
  label: string;
  icon: IconName;
}

function useSettingsNav(): SettingsNavItem[] {
  const t = useTranslations();
  return SETTINGS_NAV.map((item) => ({ href: item.href, label: t(item.labelKey), icon: item.icon }));
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
          <AccountBadge />
        </div>
      </aside>

      {/* compact: sub-tab strip above the section content */}
      <div className="mb-5 wide:hidden">
        <BackLink href="/parent/dashboard">{t("back")}</BackLink>
        <nav className={cn(settingsTab.strip, "flex overflow-x-auto")}>
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  settingsTab.box,
                  settingsTab.text,
                  settingsTab.web,
                  isActive
                    ? cn(settingsTab.boxActive, settingsTab.textActive)
                    : settingsTab.textInactive,
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
