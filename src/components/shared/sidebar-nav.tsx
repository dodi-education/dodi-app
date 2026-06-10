"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function useNavGroups(): NavGroup[] {
  const t = useTranslations("nav");

  return [
    {
      label: t("navGroupFamily"),
      items: [
        { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
        { href: "/profiles", label: t("profiles"), icon: "profiles" },
        { href: "/personas", label: t("personas"), icon: "personas" },
      ],
    },
    {
      label: t("navGroupActivity"),
      items: [
        {
          href: "/agent-sessions",
          label: t("agentSessions"),
          icon: "agent_sessions",
        },
        { href: "/system-logs", label: t("systemLogs"), icon: "system_logs" },
      ],
    },
    {
      label: t("navGroupAccount"),
      items: [{ href: "/settings", label: t("settings"), icon: "settings" }],
    },
  ];
}

export function SidebarNav() {
  const pathname = usePathname();
  const groups = useNavGroups();

  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div
            className={cn(
              "px-2.5 pb-1.5 text-[11px] font-bold tracking-[0.07em] text-faint uppercase",
              gi === 0 ? "pt-1" : "pt-4",
            )}
          >
            {group.label}
          </div>
          {group.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary-soft font-semibold text-primary"
                    : "font-medium text-ink-2 hover:bg-foreground/5",
                )}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const groups = useNavGroups();
  const navItems = groups.flatMap((g) => g.items);

  return (
    <nav className="flex items-center justify-around border-t bg-sidebar py-2">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md px-3 py-1 text-xs transition-colors",
              isActive
                ? "font-semibold text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
