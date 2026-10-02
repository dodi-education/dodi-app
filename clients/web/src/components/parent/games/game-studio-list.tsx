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
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { useTagLabel } from "@/lib/games/tag-label";
import { cn } from "@/lib/utils";
import { formAlert, libraryPill, libraryRow } from "@dodi/ui-recipes";
import {
  type GameListItem,
  copyOwnedGame,
  editedAgo,
  primaryKidIdOf,
} from "@dodi/client-state/game-library";

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
        const e = editedAgo(g.updatedAt);
        const href = `/parent/game-studio/${g.id}`;
        return (
          <div
            key={g.id}
            className={cn(libraryRow.web, libraryRow.box)}
          >
            {/* Everything except the actions menu is the link, so the audience
                badges stay part of the click target as they were before. */}
            <Link
              href={href}
              className={cn(libraryRow.webLink, libraryRow.link)}
            >
              {g.previewImage ? (
                <Image
                  src={g.previewImage}
                  alt=""
                  width={60}
                  height={60}
                  unoptimized
                  className={cn(libraryRow.thumb, libraryRow.webThumb)}
                />
              ) : (
                <div
                  className={cn(libraryRow.webThumbFallback, libraryRow.thumbFallback)}
                  style={{ background: s.bg, color: s.fg }}
                >
                  <Icon name={s.icon} size={28} />
                </div>
              )}
              <div className={libraryRow.main}>
                <div className={cn(libraryRow.webTitleRow, libraryRow.titleRow)}>
                  <span className={cn(libraryRow.webTitle, libraryRow.title, libraryRow.webTitleHover)}>
                    {g.title}
                  </span>
                  {g.isPlanning ? (
                    <span className={cn(libraryPill.box, libraryPill.text, libraryPill.primary, libraryPill.primaryText)}>
                      {t("planning")}
                    </span>
                  ) : g.isActive ? (
                    <span className={cn(libraryPill.webWithIcon, libraryPill.withIcon, libraryPill.box, libraryPill.text, libraryPill.primary, libraryPill.primaryText)}>
                      <span className={libraryPill.dot} />
                      {t("active")}
                    </span>
                  ) : (
                    <span className={cn(libraryPill.box, libraryPill.text, libraryPill.muted, libraryPill.mutedText)}>
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
                <div className={cn(libraryRow.meta, libraryRow.webMeta)}>
                  {t(e.key, e.values)}
                </div>
                {/* Plays/copies + all tags — mirrors Discover's third row. */}
                <div className={cn(libraryRow.webStats, libraryRow.stats, libraryRow.statsText)}>
                  <span
                    className={cn(libraryRow.webStat, libraryRow.stat)}
                    aria-label={t("discoverPlaysLabel", { count: g.plays })}
                    title={t("discoverPlaysLabel", { count: g.plays })}
                  >
                    <Icon name="games" size={13} />
                    {g.plays}
                  </span>
                  <span
                    className={cn(libraryRow.webStat, libraryRow.stat)}
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
                    const label = tagLabel(tag);
                    return (
                      <span
                        key={tag}
                        role="img"
                        aria-label={label}
                        title={label}
                        className={cn(libraryRow.webTagTile, libraryRow.tagTile)}
                        style={{ background: ts.bg, color: ts.fg }}
                      >
                        <Icon name={ts.icon} size={13} stroke={2} />
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
                  className={cn(libraryRow.webMenuButton, libraryRow.menuButton, libraryRow.menuButtonText)}
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
            <div className={cn(formAlert.box, formAlert.text)}>
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
  const primaryKidId = primaryKidIdOf(kids);

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
      // Re-read the decrypted row, re-seal it under this vault, create the copy.
      const createdId = await copyOwnedGame(gameFlowDeps(), game.id, primaryKidId);
      onClose();
      router.push(`/parent/game-studio/${createdId}`);
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
          <div className={cn(formAlert.box, formAlert.text)}>
            {t("discoverRemixNeedsKid")}
          </div>
        )}
        {error && (
          <div className={cn(formAlert.box, formAlert.text)}>
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
