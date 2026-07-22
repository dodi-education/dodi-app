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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiscoverShareDialog } from "@/components/parent/games/discover-share-dialog";
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
  const tagLabel = useTagLabel();
  const router = useRouter();

  const games = useGameStore((s) => s.discover);
  const cursor = useGameStore((s) => s.discoverCursor);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (games !== null) return;
    useGameStore
      .getState()
      .loadDiscover()
      .then(() => setError(null))
      .catch(() => setError(t("discoverFailedGeneric")));
  }, [games, t]);

  const shareDialog = useDialogTarget<DiscoverGameSummary>();
  const remixDialog = useDialogTarget<DiscoverGameSummary>();

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
                  {primaryTag && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {tagLabel(primaryTag)}
                    </span>
                  )}
                  {isAdded(g.sharing) && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Icon name="check" size={11} strokeWidth={3} />
                      {t("discoverAdded")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {g.publication_handle && (
                    <>
                      {t("discoverBy", { handle: g.publication_handle })}
                      {" · "}
                    </>
                  )}
                  {t("discoverAges", {
                    min: g.target_age_min,
                    max: g.target_age_max,
                  })}
                  {" · "}
                  {t("discoverDuration", {
                    minutes: g.estimated_duration_minutes,
                  })}
                </div>
                {/* Popularity: total plays across every family (play-in-place
                  aggregates on the one published row) and how often it's been
                  copied. Icon is decorative; the label carries the meaning. */}
                <div className="mt-1 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
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
                </div>
              </div>
            </button>
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
                <DropdownMenuItem onSelect={() => shareDialog.show(g)}>
                  <Icon name="share" size={15} />
                  {t("discoverShare")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => remixDialog.show(g)}>
                  <Icon name="copy" size={15} />
                  {t("discoverRemix")}
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
      const detailRes = await dodi.request(`/api/discover/games/${game.id}`);
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
