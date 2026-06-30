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

export function useNavGroups(): NavGroup[] {
  const t = useTranslations("nav");

  return [
    {
      label: t("navGroupFamily"),
      items: [
        { href: "/parent/dashboard", label: t("dashboard"), icon: "dashboard" },
        { href: "/parent/kids", label: t("kids"), icon: "kids" },
        { href: "/parent/personas", label: t("personas"), icon: "personas" },
        {
          href: "/parent/game-studio",
          label: t("gameStudio"),
          icon: "games",
        },
      ],
    },
    {
      label: t("navGroupActivity"),
      items: [
        {
          href: "/parent/agent-sessions",
          label: t("agentSessions"),
          icon: "agent_sessions",
        },
        {
          href: "/parent/system-logs",
          label: t("systemLogs"),
          icon: "system_logs",
        },
      ],
    },
  ];
}

/** Label for the nav destination matching the current path (for the mobile top bar). */
export function useCurrentNavLabel(): string | null {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = useNavGroups();
  if (pathname.startsWith("/parent/settings")) return t("settings");
  for (const group of groups) {
    const match = group.items.find((item) => pathname.startsWith(item.href));
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
                onClick={onNavigate}
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
