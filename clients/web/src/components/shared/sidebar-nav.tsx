"use client";

import { isNavItemActive, PARENT_NAV_GROUPS } from "@dodi/client-state/parent-nav";
import { navGroupLabel, navItem } from "@dodi/ui-recipes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  aliases?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The shared parent navigation (@dodi/client-state/parent-nav), localized. */
export function useNavGroups(): NavGroup[] {
  const t = useTranslations();
  return PARENT_NAV_GROUPS.map((group) => ({
    label: t(group.labelKey),
    items: group.items.map((item) => ({
      href: item.href,
      label: t(item.labelKey),
      icon: item.icon,
      aliases: item.aliases,
    })),
  }));
}

const navItemActive = isNavItemActive;

/** Label for the nav destination matching the current path (for the mobile top bar). */
export function useCurrentNavLabel(): string | null {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = useNavGroups();
  if (pathname.startsWith("/parent/settings")) return t("settings");
  for (const group of groups) {
    const match = group.items.find((item) => navItemActive(item, pathname));
    if (match) return match.label;
  }
  return null;
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useNavGroups();

  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div
            className={cn(
              navGroupLabel.text,
              gi === 0 ? navGroupLabel.first : navGroupLabel.rest,
            )}
          >
            {group.label}
          </div>
          {group.items.map((item) => {
            const isActive = navItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  navItem.box,
                  navItem.text,
                  navItem.web,
                  isActive
                    ? cn(navItem.boxActive, navItem.textActive)
                    : cn(navItem.textInactive, navItem.webInactive),
                )}
              >
                <Icon name={item.icon} size={navItem.icon.size} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
