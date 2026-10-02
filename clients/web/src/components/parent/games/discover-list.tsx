"use client";

/**
 * "Discover games" — the parent-facing browse list of published games,
 * rendered under "Your games" in the studio.
 *
 * Discover is play-in-place: "Share with kids" writes THIS family's
 * game_sharings rows pointing at the single published row (no copy), so the
 * game appears in the chosen kids' libraries and every family's plays
 * aggregate on one row. "Remix" is the copy path: it fetches the plaintext
 * content, re-seals it under this account's vault and creates a private,
 * editable game — the same flow as importing an export file.
 *
 * Everything here is plaintext by design (publication rows are a voluntary
 * disclosure), so unlike the studio list there is no decryption step.
 */
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiscoverShareDialog } from "@/components/parent/games/discover-share-dialog";
import { GameExportDialog } from "@/components/parent/games/game-export-dialog";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { useGameStore } from "@/stores/game-store";
import { primaryKidIdOf, remixDiscoverGame } from "@dodi/client-state/game-library";
import { isSharingAdded, unshareDiscoverGame } from "@dodi/client-state/game-sharing";
import type { DiscoverGameSummary } from "@dodi/types/games";
import {
  formAlert,
  libraryEmpty,
  libraryLoadMore,
  libraryPill,
  libraryRow,
} from "@dodi/ui-recipes";

/** Dialog target that survives the close animation (see game-studio-list). */
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

export function DiscoverList() {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const tagLabel = useTagLabel();
  const router = useRouter();

  const games = useGameStore((s) => s.discover);
  const cursor = useGameStore((s) => s.discoverCursor);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // loadDiscover no-ops when the cache already matches this locale, so the
  // effect re-firing on `games` (e.g. after invalidate()) stays loop-free.
  useEffect(() => {
    useGameStore
      .getState()
      .loadDiscover(locale)
      .then(() => setError(null))
      .catch(() => setError(t("discoverFailedGeneric")));
  }, [games, locale, t]);

  const shareDialog = useDialogTarget<DiscoverGameSummary>();
  const remixDialog = useDialogTarget<DiscoverGameSummary>();
  const exportDialog = useDialogTarget<DiscoverGameSummary>();
  /** Game id currently clearing its share (disables its trash button). */
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeShare(game: DiscoverGameSummary): Promise<void> {
    if (removingId) return;
    setRemovingId(game.id);
    try {
      await unshareDiscoverGame(gameFlowDeps(), game.id);
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setRemovingId(null);
    }
  }

  if (games === null) {
    return (
      <p className={libraryEmpty}>
        {error ?? "…"}
      </p>
    );
  }

  if (games.length === 0) {
    return (
      <p className={libraryEmpty}>
        {t("discoverEmpty")}
      </p>
    );
  }

  return (
    <>
      {games.map((g) => {
        const primaryTag = g.tags[0] ?? "";
        const s = tagStyle(primaryTag);
        return (
          <div
            key={g.id}
            className={cn(libraryRow.web, libraryRow.box)}
          >
            <button
              type="button"
              onClick={() => router.push(`/parent/games/${g.id}`)}
              className={cn(libraryRow.webButton, libraryRow.button)}
            >
              {g.preview_image ? (
                <Image
                  src={g.preview_image}
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
                  <span className={cn(libraryRow.webTitle, libraryRow.title)}>
                    {g.title}
                  </span>
                  {isSharingAdded(g.sharing) && (
                    <span className={cn(libraryPill.webWithIcon, libraryPill.withIcon, libraryPill.box, libraryPill.text, libraryPill.primary, libraryPill.primaryText)}>
                      <Icon name="check" size={11} strokeWidth={3} />
                      {t("discoverAdded")}
                    </span>
                  )}
                </div>
                <div className={cn(libraryRow.meta, libraryRow.webMeta)}>
                  {g.is_system ? (
                    <>
                      {t("discoverByDodi")}
                      {" · "}
                    </>
                  ) : g.publication_handle ? (
                    <>
                      {t("discoverBy", { handle: g.publication_handle })}
                      {" · "}
                    </>
                  ) : null}
                  {t("discoverAges", {
                    min: g.target_age_min,
                    max: g.target_age_max,
                  })}
                  {" · "}
                  {t("discoverDuration", {
                    minutes: g.estimated_duration_minutes,
                  })}
                </div>
                {/* Popularity + all tags. Icon is decorative; the label carries
                  the meaning. Tags sit here so the meta line stays scannable. */}
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
            </button>
            {/* Share is the primary Discover action. Once shared, the blue
                add button becomes a red trash that clears this family's
                audience (play-in-place unshare — no copy to delete). */}
            {isSharingAdded(g.sharing) ? (
              <button
                type="button"
                disabled={removingId === g.id}
                onClick={() => void removeShare(g)}
                aria-label={t("discoverUnshare")}
                title={t("discoverUnshare")}
                className={cn(libraryRow.webUnshare, libraryRow.unshare, libraryRow.unshareText)}
              >
                <Icon name="delete" size={18} />
              </button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => shareDialog.show(g)}
                aria-label={t("discoverShare")}
                title={t("discoverShare")}
                className="shrink-0"
              >
                <Icon name="user_share" size={18} />
              </Button>
            )}
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
                <DropdownMenuItem
                  onSelect={() => router.push(`/parent/games/${g.id}`)}
                >
                  <Icon name="show" size={15} />
                  {t("preview")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => remixDialog.show(g)}>
                  <Icon name="copy" size={15} />
                  {t("discoverRemix")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportDialog.show(g)}>
                  <Icon name="download" size={15} />
                  {t("export")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {cursor && (
        <div className={cn(libraryLoadMore.web, libraryLoadMore.box)}>
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              useGameStore
                .getState()
                .loadMoreDiscover()
                .catch(() => setError(t("discoverFailedGeneric")))
                .finally(() => setLoadingMore(false));
            }}
          >
            {t("discoverLoadMore")}
          </Button>
        </div>
      )}

      <DiscoverShareDialog
        open={shareDialog.open}
        game={shareDialog.target}
        onClose={shareDialog.hide}
      />
      <DiscoverRemixDialog
        open={remixDialog.open}
        game={remixDialog.target}
        onClose={remixDialog.hide}
      />
      <GameExportDialog
        open={exportDialog.open}
        gameId={exportDialog.target?.id ?? null}
        onClose={exportDialog.hide}
        source="discover"
      />
    </>
  );
}

/**
 * Remix: fetch the plaintext detail, re-seal it under this account's vault and
 * create a private, editable copy (inactive, no audience — configured in the
 * studio afterwards). Mirrors the import flow's seal-then-POST.
 */
function DiscoverRemixDialog({
  open,
  game,
  onClose,
}: {
  open: boolean;
  game: DiscoverGameSummary | null;
  onClose: () => void;
}) {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const router = useRouter();
  const { kids } = useKids();
  const primaryKidId = primaryKidIdOf(kids);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear a stale error each time the dialog opens (render-phase adjustment).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError(null);
  }

  async function remix(): Promise<void> {
    if (!game || !primaryKidId || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Fetch the plaintext detail, re-seal it under this vault, create the copy.
      const createdId = await remixDiscoverGame(gameFlowDeps(), game.id, primaryKidId, locale);
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
          <Button onClick={() => void remix()} disabled={!primaryKidId || busy}>
            <Icon name="copy" size={15} />
            {t("discoverRemixConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
