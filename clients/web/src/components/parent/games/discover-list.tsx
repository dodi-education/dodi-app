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
import { dodi } from "@/lib/api";
import { useKids } from "@/hooks/use-kids";
import { sealGameCreateFields, useGameStore } from "@/stores/game-store";
import type { Json } from "@dodi/types/database";
import type {
  DiscoverGameDetail,
  DiscoverGameSummary,
  GameSharingState,
} from "@dodi/types/games";

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

function isAdded(sharing: GameSharingState): boolean {
  return sharing.family || sharing.kidIds.length > 0;
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
      const res = await dodi.request(`/api/discover/games/${game.id}/sharing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFamily: false, audienceIds: [] }),
      });
      if (!res.ok) throw new Error();
      useGameStore
        .getState()
        .patchDiscoverSharing(game.id, { family: false, kidIds: [] });
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setRemovingId(null);
    }
  }

  if (games === null) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        {error ?? "…"}
      </p>
    );
  }

  if (games.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
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
            className="flex items-center gap-3 border-b border-border py-3 pl-3 pr-1 last:border-0"
          >
            <button
              type="button"
              onClick={() => router.push(`/parent/games/${g.id}`)}
              className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-primary-soft-2"
            >
              {g.preview_image ? (
                <Image
                  src={g.preview_image}
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
                  <span className="truncate text-sm font-semibold text-ink-1">
                    {g.title}
                  </span>
                  {isAdded(g.sharing) && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Icon name="check" size={11} strokeWidth={3} />
                      {t("discoverAdded")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
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
            </button>
            {/* Share is the primary Discover action. Once shared, the blue
                add button becomes a red trash that clears this family's
                audience (play-in-place unshare — no copy to delete). */}
            {isAdded(g.sharing) ? (
              <button
                type="button"
                disabled={removingId === g.id}
                onClick={() => void removeShare(g)}
                aria-label={t("discoverUnshare")}
                title={t("discoverUnshare")}
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger text-white transition-colors outline-none hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/40 disabled:pointer-events-none disabled:opacity-50"
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-2 transition-colors outline-none hover:border-border-strong hover:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 data-[state=open]:border-border-strong data-[state=open]:bg-card"
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
        <div className="flex justify-center pt-3">
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
  const primaryKidId = kids?.[0]?.id ?? null;

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
      const detailRes = await dodi.request(
        `/api/discover/games/${game.id}?locale=${encodeURIComponent(locale)}`,
      );
      if (!detailRes.ok) throw new Error();
      const detail = (await detailRes.json()) as DiscoverGameDetail;

      const sealed = await sealGameCreateFields({
        title: detail.title,
        description: detail.description || undefined,
        markdown: detail.markdown || undefined,
        codeBundle: detail.code_bundle,
        learningGoal: detail.learning_goal || undefined,
        successDefinition: detail.success_definition || undefined,
        successCriteria:
          detail.success_criteria &&
          typeof detail.success_criteria === "object" &&
          Object.keys(detail.success_criteria).length
            ? (detail.success_criteria as Json)
            : undefined,
        // The published row's plaintext preview, re-sealed under this vault.
        previewImage: detail.preview_image || undefined,
      });
      const res = await dodi.request("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kidId: primaryKidId,
          sourceGameId: game.id,
          ...sealed,
          tags: detail.tags,
          progressKind: detail.progress_kind,
          targetAgeMin: detail.target_age_min,
          targetAgeMax: detail.target_age_max,
          estimatedDurationMinutes: detail.estimated_duration_minutes,
          metadata: detail.metadata ?? {},
          // A remix starts inactive, like an import — the parent reviews first.
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
          <Button onClick={() => void remix()} disabled={!primaryKidId || busy}>
            <Icon name="copy" size={15} />
            {t("discoverRemixConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
