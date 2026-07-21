"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";

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

type EditedKey = "editedToday" | "editedDaysAgo" | "editedWeeksAgo";

function editedKey(iso: string): { key: EditedKey; values?: Record<string, number> } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { key: "editedToday" };
  if (days < 7) return { key: "editedDaysAgo", values: { days } };
  return { key: "editedWeeksAgo", values: { weeks: Math.floor(days / 7) } };
}

interface GameStudioListProps {
  items: GameListItem[];
  /** Deletes the game server-side; the list owns the confirmation around it. */
  onDelete: (id: string) => Promise<void>;
}

/**
 * Renders the studio's game list. Builds now run inside the studio tab itself
 * (client-side), so there is no cross-page "building" state to track here.
 *
 * The row is a link into the studio; per-game actions live in a "…" menu next to
 * it rather than inside the link, since a button nested in an anchor is invalid
 * markup and would trigger the navigation on every click.
 */
export function GameStudioList({ items, onDelete }: GameStudioListProps) {
  const t = useTranslations("gameStudio");
  const tagLabel = useTagLabel();

  // Deleting a game also drops its version history and autosaves, so it is
  // confirmed rather than done straight from the menu.
  const [pendingDelete, setPendingDelete] = useState<GameListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("deleteFailedGeneric"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {items.map((g) => {
        const primaryTag = g.tags[0] ?? "";
        const s = tagStyle(primaryTag);
        const e = editedKey(g.updatedAt);
        const href = `/parent/game-studio/${g.id}`;
        return (
          <div
            key={g.id}
            className="flex items-center gap-3 border-b border-border px-1 py-3 last:border-0"
          >
            {/* Everything except the actions menu is the link, so the audience
                badges stay part of the click target as they were before. */}
            <Link
              href={href}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: s.bg, color: s.fg }}
              >
                <Icon name={s.icon} size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink-1 transition-colors group-hover:text-primary">
                    {g.title}
                  </span>
                  {primaryTag && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {tagLabel(primaryTag)}
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
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("gameActions", { title: g.title })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-2 transition-colors outline-none hover:border-border-strong hover:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 data-[state=open]:border-border-strong data-[state=open]:bg-card"
                >
                  <Icon name="dots" size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {/* A real link, so middle-click / cmd-click still open the
                    studio in a new tab. */}
                <DropdownMenuItem asChild>
                  <Link href={href}>
                    <Icon name="edit" size={15} />
                    {t("edit")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    setError(null);
                    setPendingDelete(g);
                  }}
                >
                  <Icon name="delete" size={15} />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDescription", { title: pendingDelete?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {t("deleteCancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              <Icon name="delete" size={15} />
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
