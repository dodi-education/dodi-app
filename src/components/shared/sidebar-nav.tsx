"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const navItems: Array<{ href: string; label: string; icon: IconName }> = [
    { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
    { href: "/profiles", label: t("profiles"), icon: "profiles" },
    { href: "/personas", label: t("personas"), icon: "personas" },
    { href: "/system-logs", label: t("systemLogs"), icon: "system_logs" },
    { href: "/agent-sessions", label: t("agentSessions"), icon: "agent_sessions" },
    { href: "/settings", label: t("settings"), icon: "settings" },
  ];

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const navItems: Array<{ href: string; label: string; icon: IconName }> = [
    { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
    { href: "/profiles", label: t("profiles"), icon: "profiles" },
    { href: "/personas", label: t("personas"), icon: "personas" },
    { href: "/system-logs", label: t("systemLogs"), icon: "system_logs" },
    { href: "/agent-sessions", label: t("agentSessions"), icon: "agent_sessions" },
    { href: "/settings", label: t("settings"), icon: "settings" },
  ];

  return (
    <nav className="flex items-center justify-around border-t bg-background py-2">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-accent-foreground",
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
