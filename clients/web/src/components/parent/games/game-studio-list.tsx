"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  DiscoverShareDialog,
  type ShareableGame,
} from "@/components/parent/games/discover-share-dialog";
import { GameExportDialog } from "@/components/parent/games/game-export-dialog";
import { PublishDialog } from "@/components/parent/games/publish-dialog";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import { useTagLabel } from "@/lib/games/tag-label";
import { sealGameCreateFields, useGameStore } from "@/stores/game-store";
import type { Json } from "@dodi/types/database";
import type { GameSharingState } from "@dodi/types/games";

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
  /** Current sharing state — seeds the "Share with kids" dialog. */
  sharing: GameSharingState;
  /** Dodi has written real code (not the unbuilt placeholder) — publishable. */
  built: boolean;
  /** Decrypted 100×100 list preview; null falls back to the tag tile. */
  previewImage: string | null;
  /** Times this game has been played (this row's game_plays). */
  plays: number;
  /** Private remixes pointing back at this game via source_game_id. */
  copies: number;
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
 * Dialog state that keeps its subject through the close animation. Driving a
 * dialog straight off `target !== null` makes the content flip to its empty
 * state for the 200ms it spends fading out.
 */
function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return {
    target,
    open,
    show: (next: T) => {
      setTarget(next);
      setOpen(true);
    },
    hide: () => setOpen(false),
  };
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

  // One instance of each dialog serves the whole list, aimed at whichever game's
  // menu opened it. Deleting also drops the version history and autosaves, so it
  // is confirmed rather than done straight from the menu.
  const deleteDialog = useDialogTarget<GameListItem>();
  const shareDialog = useDialogTarget<GameListItem>();
  const copyDialog = useDialogTarget<GameListItem>();
  const exportDialog = useDialogTarget<GameListItem>();
  const publishDialog = useDialogTarget<GameListItem>();

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete(): Promise<void> {
    const target = deleteDialog.target;
    if (!target || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(target.id);
      deleteDialog.hide();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("deleteFailedGeneric"));
    } finally {
      setDeleting(false);
    }
  }

  const shareTarget: ShareableGame | null = shareDialog.target
    ? {
        id: shareDialog.target.id,
        title: shareDialog.target.title,
        sharing: shareDialog.target.sharing,
      }
    : null;

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
            className="flex items-center gap-3 border-b border-border py-3 pl-3 pr-1 last:border-0"
          >
            {/* Everything except the actions menu is the link, so the audience
                badges stay part of the click target as they were before. */}
            <Link
              href={href}
              className="group flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
            >
              {g.previewImage ? (
                <Image
                  src={g.previewImage}
                  alt=""
                  width={60}
                  height={60}
                  unoptimized
                  className="h-15 w-15 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="flex h-15 w-15 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: s.bg, color: s.fg }}
                >
                  <Icon name={s.icon} size={28} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink-1 transition-colors group-hover:text-primary">
                    {g.title}
                  </span>
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
                  {g.isFamily ? (
                    <span
                      className="hidden shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary sm:inline-flex"
                      title={t("family")}
                    >
                      <Icon name="friends" size={11} />
                      {t("family")}
                    </span>
                  ) : g.kidNames.length > 0 ? (
                    <span className="hidden shrink-0 items-center -space-x-1.5 sm:flex">
                      {g.kidNames.slice(0, 3).map((name, i) => (
                        <span
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-primary-soft text-[10px] font-bold text-primary"
                          title={name}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t(e.key, e.values)}
                </div>
                {/* Plays/copies + all tags — mirrors Discover's third row. */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
                  <span
                    className="inline-flex items-center gap-1"
                    aria-label={t("discoverPlaysLabel", { count: g.plays })}
                    title={t("discoverPlaysLabel", { count: g.plays })}
                  >
                    <Icon name="games" size={13} />
                    {g.plays}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    aria-label={t("discoverCopiesLabel", { count: g.copies })}
                    title={t("discoverCopiesLabel", { count: g.copies })}
                  >
                    <Icon name="copy" size={13} />
                    {g.copies}
                  </span>
                  {g.tags.map((raw) => {
                    const tag = raw.trim().toLowerCase();
                    if (!tag) return null;
                    const ts = tagStyle(tag);
                    return (
                      <span
                        key={tag}
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: ts.bg, color: ts.fg }}
                      >
                        {tagLabel(tag)}
                      </span>
                    );
                  })}
                </div>
              </div>
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
                <DropdownMenuItem onSelect={() => shareDialog.show(g)}>
                  <Icon name="user_share" size={15} />
                  {t("discoverShare")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyDialog.show(g)}>
                  <Icon name="copy" size={15} />
                  {t("discoverRemix")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportDialog.show(g)}>
                  <Icon name="download" size={15} />
                  {t("export")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => publishDialog.show(g)}>
                  <Icon name="world_up" size={15} />
                  {t("publish")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    setError(null);
                    deleteDialog.show(g);
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

      <DiscoverShareDialog
        open={shareDialog.open}
        game={shareTarget}
        onClose={shareDialog.hide}
        variant="studio"
      />

      <StudioCopyDialog
        open={copyDialog.open}
        game={copyDialog.target}
        onClose={copyDialog.hide}
      />

      <GameExportDialog
        open={exportDialog.open}
        gameId={exportDialog.target?.id ?? null}
        onClose={exportDialog.hide}
      />

      <PublishDialog
        open={publishDialog.open}
        gameId={publishDialog.target?.id ?? null}
        built={publishDialog.target?.built ?? false}
        onClose={publishDialog.hide}
      />

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open && !deleting) deleteDialog.hide();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDescription", { title: deleteDialog.target?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={deleteDialog.hide} disabled={deleting}>
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

/**
 * Create a private, editable copy of an owned studio game. Loads the decrypted
 * row, re-seals content under the vault, and POSTs a new inactive game (same
 * path as Discover remix / import).
 */
function StudioCopyDialog({
  open,
  game,
  onClose,
}: {
  open: boolean;
  game: GameListItem | null;
  onClose: () => void;
}) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const { kids } = useKids();
  const primaryKidId = kids?.[0]?.id ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError(null);
  }

  async function createCopy(): Promise<void> {
    if (!game || !primaryKidId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await useGameStore.getState().loadOne(game.id, undefined, true);
      if (!row) throw new Error();

      const sealed = await sealGameCreateFields({
        title: row.title,
        description: row.description || undefined,
        markdown: row.markdown || undefined,
        codeBundle: row.code_bundle,
        learningGoal: row.learning_goal || undefined,
        successDefinition: row.success_definition || undefined,
        successCriteria:
          row.success_criteria &&
          typeof row.success_criteria === "object" &&
          Object.keys(row.success_criteria).length
            ? (row.success_criteria as Json)
            : undefined,
        previewImage: row.preview_image || undefined,
      });
      const res = await dodi.request("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kidId: primaryKidId,
          sourceGameId: game.id,
          ...sealed,
          tags: row.tags,
          progressKind: row.progress_kind,
          targetAgeMin: row.target_age_min,
          targetAgeMax: row.target_age_max,
          estimatedDurationMinutes: row.estimated_duration_minutes,
          metadata: row.metadata ?? {},
          // A copy starts inactive — parent reviews before kids see it.
          isActive: false,
        }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as { id: string };
      useGameStore.getState().invalidate();
      onClose();
      router.push(`/parent/game-studio/${created.id}`);
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("discoverRemixTitle")}</DialogTitle>
          <DialogDescription>
            {t("discoverRemixDescription", { title: game?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {!primaryKidId && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {t("discoverRemixNeedsKid")}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("importCancel")}
          </Button>
          <Button onClick={() => void createCopy()} disabled={!primaryKidId || busy}>
            <Icon name="copy" size={15} />
            {t("discoverRemixConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
