"use client";

/**
 * "Share with kids" — pick family or specific kids for a game's audience.
 *
 * Two backends, one UI:
 * - `discover` (default): play-in-place on a published row via
 *   `PUT /api/discover/games/:id/sharing`. No copy is made; plays aggregate
 *   on the single published game.
 * - `studio`: private owned game via `PATCH /api/games/:id` with `audience`.
 *   Kids see it through the normal library visibility rules.
 *
 * Used by both list menus and the Discover preview page.
 */
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
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { useGameStore } from "@/stores/game-store";
import type { GameSharingState } from "@dodi/types/games";

/** Fields the share dialog needs — works for Discover summaries and studio rows. */
export type ShareableGame = {
  id: string;
  title: string;
  sharing: GameSharingState;
};

export type ShareDialogVariant = "discover" | "studio";

/** Pick which of this family's kids can play the game. */
export function DiscoverShareDialog({
  open,
  game,
  onClose,
  onSaved,
  variant = "discover",
}: {
  open: boolean;
  game: ShareableGame | null;
  onClose: () => void;
  /**
   * Fired with the saved audience after a successful save (in addition to the
   * store patch), so a caller holding its own copy of the sharing state — e.g.
   * the preview page — can keep it in sync.
   */
  onSaved?: (sharing: GameSharingState) => void;
  /** Which backend owns this game's sharing rows. */
  variant?: ShareDialogVariant;
}) {
  const t = useTranslations("gameStudio");
  const { kids } = useKids();
  const kidOptions = (kids ?? []).map((k) => ({
    id: k.id,
    name: k.display_name,
  }));

  const [isFamily, setIsFamily] = useState(false);
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the pills from the game's current sharing each time it opens
  // (render-phase adjustment — no effect, no extra paint).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && game) {
      setIsFamily(game.sharing.family);
      setAudienceIds(game.sharing.kidIds);
      setError(null);
    }
  }

  async function save(): Promise<void> {
    if (!game || busy) return;
    setBusy(true);
    setError(null);
    try {
      let sharing: GameSharingState;
      if (variant === "studio") {
        const res = await dodi.request(`/api/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience: { isFamily, audienceIds },
          }),
        });
        if (!res.ok) throw new Error();
        sharing = {
          family: isFamily,
          kidIds: isFamily ? [] : audienceIds,
        };
        useGameStore.getState().patchLocal(game.id, { sharing });
        // Audience changed — kid libraries must refetch on next visit.
        useGameStore.setState({ byKid: {} });
      } else {
        const res = await dodi.request(`/api/discover/games/${game.id}/sharing`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFamily, audienceIds }),
        });
        if (!res.ok) throw new Error();
        ({ sharing } = (await res.json()) as { sharing: GameSharingState });
        useGameStore.getState().patchDiscoverSharing(game.id, sharing);
      }
      onSaved?.(sharing);
      onClose();
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const descriptionKey =
    variant === "studio" ? "studioShareDescription" : "discoverShareDescription";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("discoverShareTitle")}</DialogTitle>
          <DialogDescription>
            {t(descriptionKey, { title: game?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <AudiencePill
            selected={isFamily}
            onClick={() => {
              setIsFamily(true);
              setAudienceIds([]);
            }}
            icon
            label={t("family")}
          />
          {kidOptions.map((kid) => (
            <AudiencePill
              key={kid.id}
              selected={!isFamily && audienceIds.includes(kid.id)}
              onClick={() => {
                setIsFamily(false);
                setAudienceIds((ids) =>
                  ids.includes(kid.id)
                    ? ids.filter((id) => id !== kid.id)
                    : [...ids, kid.id],
                );
              }}
              initial={kid.name.charAt(0).toUpperCase()}
              label={kid.name}
            />
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("importCancel")}
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            <Icon name="user_share" size={15} />
            {t("discoverShareConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact audience pill (visual twin of the import dialog's). */
function AudiencePill({
  selected,
  onClick,
  label,
  icon,
  initial,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: boolean;
  initial?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary-soft text-primary"
          : "border-border-strong bg-card text-ink-2 hover:border-faint",
      )}
    >
      {icon ? (
        <Icon
          name="friends"
          size={16}
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}
