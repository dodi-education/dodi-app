"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useStudioBuild } from "@/stores/studio-build-store";

/**
 * App-wide companion of a running Game Studio build. The build lives in the
 * studio build store, so the parent may move around the app while it runs;
 * this keeps the screen awake, asks before the tab closes (a close pauses the
 * build at its last checkpoint), and offers the way back to the studio from
 * anywhere else.
 */
export function BuildActivityHost(): React.ReactNode {
  const t = useTranslations("buildActivity");
  const pathname = usePathname();
  const gameId = useStudioBuild((s) => s.active?.gameId ?? null);
  const isBuilding = gameId !== null;

  useWakeLock(isBuilding);

  useEffect(() => {
    if (!isBuilding) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Legacy browsers require a returnValue to show the native prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isBuilding]);

  const studioPath = gameId ? `/parent/game-studio/${gameId}` : null;
  if (!studioPath || pathname.startsWith(studioPath)) return null;

  return (
    <div
      role="status"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 text-sm font-medium shadow-lg"
    >
      <Icon name="games" size={16} className="shrink-0 text-primary motion-safe:animate-pulse" />
      <span>{t("building")}</span>
      <Link
        href={`${studioPath}/preview`}
        className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-primary-foreground hover:opacity-90"
      >
        {t("open")}
      </Link>
    </div>
  );
}
