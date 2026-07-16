"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { activeKidId, buildCrumbs } from "@/components/shared/build-crumbs";
import { Icon } from "@/components/shared/icon";
import { useKids } from "@/hooks/use-kids";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { cn } from "@/lib/utils";
import type { Kid } from "@dodi/types/database";

export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations();
  const { kids } = useKids();
  const leaf = useBreadcrumbStore((s) => s.leaf);

  const kidId = activeKidId(pathname);
  const kidName = kidId
    ? (kids?.find((k) => k.id === kidId)?.display_name ?? null)
    : null;

  // The persona crumb arrives via the leaf override: the detail page already
  // fetches + decrypts its persona, so no /api/personas fetch happens here.
  const crumbs = buildCrumbs(pathname, t, {
    kidName,
    leafOverride: leaf,
  });
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-[22px] tracking-tight"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <div key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 ? (
              <Icon
                name="chevron_right"
                size={18}
                className="shrink-0 text-faint"
              />
            ) : null}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="truncate font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "truncate",
                  isLast
                    ? "font-semibold text-ink"
                    : "font-medium text-muted-foreground",
                )}
              >
                {crumb.label}
              </span>
            )}
            {crumb.isKidCrumb && kidId && kids && kids.length > 0 ? (
              <KidSwitcher kids={kids} activeId={kidId} pathname={pathname} />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Compact popover that swaps the kid id in the current path, keeping the
 * sub-route (so `…/[id]/memory` stays on memory). Bespoke popover mirroring the
 * outside-click/Escape pattern in `components/kid/kid-switcher.tsx`.
 */
function KidSwitcher({
  kids,
  activeId,
  pathname,
}: {
  kids: Kid[];
  activeId: string;
  pathname: string;
}) {
  const router = useRouter();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(kid: Kid) {
    setOpen(false);
    if (kid.id === activeId) return;
    const next = pathname.replace(
      /(\/parent\/kids\/)[^/]+/,
      `$1${kid.id}`,
    );
    router.push(next);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("switchKid")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-primary",
          open && "bg-foreground/5 text-primary",
        )}
      >
        <Icon name="switch_vertical" size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border bg-card p-1 shadow-lg"
        >
          {kids.map((kid) => {
            const isActive = kid.id === activeId;
            return (
              <button
                key={kid.id}
                type="button"
                role="menuitem"
                onClick={() => pick(kid)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-primary-soft font-semibold text-primary"
                    : "font-medium text-ink-2 hover:bg-foreground/5",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft-2 text-[11px] font-bold text-primary">
                  {kid.display_name[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {kid.display_name}
                </span>
                {isActive ? (
                  <Icon
                    name="check"
                    size={16}
                    stroke={2.4}
                    className="text-primary"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
