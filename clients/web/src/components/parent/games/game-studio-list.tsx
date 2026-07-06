"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { tagStyle } from "@/components/parent/games/tag-style";

export interface GameListItem {
  id: string;
  title: string;
  tags: string[];
  updatedAt: string;
  /** Whether kids can see/play this game (false = parent hasn't activated it). */
  isActive: boolean;
  /** Shared with the whole family. */
  isFamily: boolean;
  /** Decrypted names of the specific kids this game is shared with. */
  kidNames: string[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type EditedKey = "editedToday" | "editedDaysAgo" | "editedWeeksAgo";

function editedKey(iso: string): { key: EditedKey; values?: Record<string, number> } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { key: "editedToday" };
  if (days < 7) return { key: "editedDaysAgo", values: { days } };
  return { key: "editedWeeksAgo", values: { weeks: Math.floor(days / 7) } };
}

/**
 * Renders the studio's game list. Builds now run inside the studio tab itself
 * (client-side), so there is no cross-page "building" state to track here.
 */
export function GameStudioList({ items }: { items: GameListItem[] }) {
  const t = useTranslations("gameStudio");

  return (
    <>
      {items.map((g) => {
        const primaryTag = g.tags[0] ?? "";
        const s = tagStyle(primaryTag);
        const e = editedKey(g.updatedAt);
        return (
          <Link
            key={g.id}
            href={`/parent/game-studio/${g.id}`}
            className="group flex items-center gap-3 border-b border-border px-1 py-3 last:border-0"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: s.bg, color: s.fg }}
            >
              <Icon name={s.icon} size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink-1">{g.title}</span>
                {primaryTag && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: s.bg, color: s.fg }}
                  >
                    {capitalize(primaryTag)}
                  </span>
                )}
                {g.isActive ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <span className="h-[7px] w-[7px] rounded-full bg-primary" />
                    {t("active")}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {t("inactive")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {t(e.key, e.values)}
              </div>
            </div>
            {g.isFamily ? (
              <span
                className="hidden shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex"
                title={t("family")}
              >
                <Icon name="friends" size={12} />
                {t("family")}
              </span>
            ) : g.kidNames.length > 0 ? (
              <span className="hidden shrink-0 items-center -space-x-1.5 sm:flex">
                {g.kidNames.slice(0, 3).map((name, i) => (
                  <span
                    key={i}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary-soft text-xs font-bold text-primary"
                    title={name}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-2 transition-colors group-hover:border-primary group-hover:text-primary">
              <Icon name="refresh" size={13} />
              {t("edit")}
            </span>
          </Link>
        );
      })}
    </>
  );
}
