"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AccountBadge } from "@/components/parent/account-badge";
import { KidViewButton } from "@/components/parent/kid-view-button";
import { Icon } from "@/components/shared/icon";
import {
  SidebarNav,
  useCurrentNavLabel,
} from "@/components/shared/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Parent chrome: a persistent left rail in landscape/desktop (`wide`), and a
 * hamburger-triggered off-canvas drawer in portrait/narrow viewports
 * (`compact`). There is no bottom navigation.
 */
export function ParentShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const pageLabel = useCurrentNavLabel();
  const [open, setOpen] = useState(false);

  // Nav-link taps close the drawer via onNavigate; this covers browser
  // back/forward, which also dismisses the open drawer.
  useEffect(() => {
    const onPopState = () => setOpen(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Close the drawer on Escape while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col wide:flex-row">
      {/* Mobile top bar (compact only) */}
      <header className="sticky top-0 z-40 hidden h-14 items-center gap-3 border-b bg-sidebar px-3 compact:flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("openMenu")}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-2 active:bg-foreground/5"
        >
          <Icon name="menu" size={22} stroke={2} />
        </button>
        <Link
          href="/parent/dashboard"
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Image
            src="/images/dodi-head-active.png"
            alt=""
            width={26}
            height={26}
            className="shrink-0"
          />
          <span className="truncate font-bold">{pageLabel ?? "dodi"}</span>
        </Link>
        <KidViewButton compact />
      </header>

      {/* Drawer backdrop (compact only) */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[55] hidden bg-foreground/40 transition-opacity duration-300 compact:block",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar — persistent rail in wide, off-canvas drawer in compact */}
      <aside
        className={cn(
          "flex w-[274px] max-w-[84vw] shrink-0 flex-col border-r bg-sidebar px-3 pt-5 pb-4",
          // compact: off-canvas fixed drawer
          "fixed inset-y-0 left-0 z-[60] shadow-[0_18px_50px_rgba(34,56,78,0.22)] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
          // wide: persistent sticky rail
          "wide:sticky wide:top-0 wide:z-auto wide:h-screen wide:w-56 wide:translate-x-0 wide:shadow-none",
        )}
      >
        <div className="flex items-center gap-2.5 px-2.5 pb-4">
          <Image
            src="/images/dodi-head-active.png"
            alt="dodi"
            width={30}
            height={30}
          />
          <span className="text-[17px] font-bold tracking-tight">dodi</span>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/parent/settings/general"
              onClick={() => setOpen(false)}
              aria-label={t("settings")}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-primary active:bg-foreground/5"
            >
              <Icon name="settings" size={18} stroke={2} />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("closeMenu")}
              className="hidden size-9 items-center justify-center rounded-md text-muted-foreground active:bg-foreground/5 compact:flex"
            >
              <Icon name="close" size={18} stroke={2} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <div className="mt-auto flex flex-col gap-2.5 pt-3">
          <KidViewButton />
          <AccountBadge />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">
          <div className="max-w-[880px] px-4 py-5 pb-[72px] wide:px-12 wide:py-9 wide:pb-20">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
