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
import { cn } from "@/lib/utils";
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { useKids } from "@/hooks/use-kids";
import {
  type AudienceSelection,
  type ShareVariant,
  type ShareableGame,
  audienceFromSharing,
  isAudienceKidSelected,
  saveGameSharing,
  selectFamilyAudience,
  toggleAudienceKid,
} from "@dodi/client-state/game-sharing";
import type { GameSharingState } from "@dodi/types/games";
import { audiencePill, formAlert } from "@dodi/ui-recipes";

export type { ShareableGame };

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
  variant?: ShareVariant;
}) {
  const t = useTranslations("gameStudio");
  const { kids } = useKids();
  const kidOptions = (kids ?? []).map((k) => ({
    id: k.id,
    name: k.display_name,
  }));

  const [audience, setAudience] = useState<AudienceSelection>({
    isFamily: false,
    audienceIds: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the pills from the game's current sharing each time it opens
  // (render-phase adjustment — no effect, no extra paint).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && game) {
      setAudience(audienceFromSharing(game.sharing));
      setError(null);
    }
  }

  async function save(): Promise<void> {
    if (!game || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Saves through the variant's backend and mirrors it into the game cache.
      const sharing = await saveGameSharing(gameFlowDeps(), variant, game.id, audience);
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

        <div className={cn(audiencePill.webRow, audiencePill.row)}>
          <AudiencePill
            selected={audience.isFamily}
            onClick={() => setAudience(selectFamilyAudience())}
            icon
            label={t("family")}
          />
          {kidOptions.map((kid) => (
            <AudiencePill
              key={kid.id}
              selected={isAudienceKidSelected(audience, kid.id)}
              onClick={() => setAudience((current) => toggleAudienceKid(current, kid.id))}
              initial={kid.name.charAt(0).toUpperCase()}
              label={kid.name}
            />
          ))}
        </div>

        {error && (
          <div className={cn(formAlert.box, formAlert.text)}>
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
        audiencePill.web,
        audiencePill.box,
        audiencePill.text,
        selected
          ? cn(audiencePill.selected, audiencePill.selectedText)
          : cn(audiencePill.idle, audiencePill.idleText, audiencePill.webIdle),
      )}
    >
      {icon ? (
        <Icon
          name="friends"
          size={16}
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
      ) : (
        <span className={cn(audiencePill.webInitial, audiencePill.initial, audiencePill.initialText)}>
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}
