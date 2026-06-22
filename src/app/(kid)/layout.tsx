"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { DodiCompact } from "@/components/dodi/dodi-compact";
import { cn } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/kid/profile-switcher";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useVaultStore } from "@/stores/vault-store";

export default function KidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();

  const displayMode = useDodiSessionStore((s) => s.displayMode);
  const context = useDodiSessionStore((s) => s.context);
  const pendingNavigation = useDodiSessionStore((s) => s.pendingNavigation);
  const clearPendingNavigation = useDodiSessionStore((s) => s.clearPendingNavigation);
  const dodiState = useDodiSessionStore((s) => s.state);
  const gestureNeeded = useDodiSessionStore((s) => s.gestureNeeded);
  const activate = useDodiSessionStore((s) => s.activate);

  // Ensure the vault is unlocked in kid view (kids enter after the parent has
  // unlocked; silently re-unlocks via the device key on a fresh load).
  useEffect(() => {
    const { status, unlockSilently } = useVaultStore.getState();
    if (status !== "unlocked") void unlockSilently();
  }, []);

  // Tear down Dodi voice session when leaving the kid view entirely
  useEffect(() => {
    return () => {
      useDodiSessionStore.getState().endSession();
    };
  }, []);

  useEffect(() => {
    if (pendingNavigation) {
      router.push(pendingNavigation);
      clearPendingNavigation();
    }
  }, [pendingNavigation, router, clearPendingNavigation]);

  // Global gesture listener: when Dodi is deaf because AudioContext needs a
  // user gesture, any click on the page activates her. The handler does NOT
  // call preventDefault/stopPropagation so navigation and buttons still work.
  useEffect(() => {
    if (dodiState !== "deaf" || !gestureNeeded) return;

    function handleGlobalClick() {
      void activate();
    }

    document.addEventListener("click", handleGlobalClick, { capture: true, once: true });
    return () => document.removeEventListener("click", handleGlobalClick, { capture: true });
  }, [dodiState, gestureNeeded, activate]);

  const isFullMode = context.type === "game" && displayMode === "full";

  const kidNavItems: Array<{ href: string; label: string; icon: IconName }> = [
    { href: "/home", label: t("home"), icon: "home" },
    { href: "/games", label: t("games"), icon: "games" },
    { href: "/friends", label: t("friends"), icon: "friends" },
  ];

  function handleSwitchToParent(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modified clicks (ctrl/cmd-click, middle-click,
    // "open in new tab") natively instead of intercepting the navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    // End Dodi session before leaving kid view
    useDodiSessionStore.getState().endSession();
    document.cookie = "dodi-view=parent; path=/; max-age=86400";
    router.push("/parent/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col font-kid">
      {/* Kid header */}
      <header className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <ProfileSwitcher />
          {displayMode === "compact" && <DodiCompact />}
        </div>
        <a
          href="/parent/dashboard"
          onClick={handleSwitchToParent}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold text-faint transition-colors hover:text-muted-foreground"
          aria-label="Switch to parent view"
        >
          <Icon name="lock" size={15} />
          {t("parent")}
        </a>
      </header>

      {/* Main content — full-mode game views (play/edit/create) own their own
          layout via GameViewShell: a full-width title bar above the Dodi panel
          and the game content. */}
      {isFullMode ? (
        <main className="flex flex-1 flex-col px-4 pb-24">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center px-4 pb-24">
          {children}
        </main>
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 border-t bg-white/85 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
        {kidNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[88px] flex-col items-center gap-1 rounded-2xl px-5 py-2 text-[13.5px] font-extrabold transition-colors sm:min-w-[110px]",
                isActive
                  ? "bg-primary-soft text-primary"
                  : "text-faint hover:text-muted-foreground",
              )}
            >
              <Icon name={item.icon} className="h-6 w-6" stroke={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
