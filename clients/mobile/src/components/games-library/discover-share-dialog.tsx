import { useState } from "react";
import { useTranslations } from "use-intl";
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

import { Button, Dialog } from "@/components/ui";
import { gameFlowDeps } from "@/lib/game-flow-deps";
import { useKids } from "@/lib/use-kids";

import { AudiencePill, AudiencePillRow } from "./audience-pill";
import { FormAlert } from "./form-alert";

export type { ShareableGame };

/**
 * "Share with kids": pick family or specific kids for a game's audience (web:
 * discover-share-dialog). `discover` writes this family's play-in-place rows
 * on a published game; `studio` sets an owned game's audience.
 */
export function DiscoverShareDialog({
  isOpen,
  game,
  onClose,
  onSaved,
  variant = "discover",
}: {
  isOpen: boolean;
  game: ShareableGame | null;
  onClose: () => void;
  /** Fired with the saved audience, for a caller holding its own copy (the preview). */
  onSaved?: (sharing: GameSharingState) => void;
  variant?: ShareVariant;
}) {
  const t = useTranslations("gameStudio");
  const { kids } = useKids();
  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));

  const [audience, setAudience] = useState<AudienceSelection>({ isFamily: false, audienceIds: [] });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the pills from the game's current sharing each time it opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && game) {
      setAudience(audienceFromSharing(game.sharing));
      setError(null);
    }
  }

  async function save(): Promise<void> {
    if (!game || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const sharing = await saveGameSharing(gameFlowDeps(), variant, game.id, audience);
      onSaved?.(sharing);
      onClose();
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setIsBusy(false);
    }
  }

  const descriptionKey = variant === "studio" ? "studioShareDescription" : "discoverShareDescription";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("discoverShareTitle")}
      description={t(descriptionKey, { title: game?.title ?? "" })}
      footer={
        <>
          <Button icon="user_share" isLoading={isBusy} onPress={() => void save()}>
            {t("discoverShareConfirm")}
          </Button>
          <Button variant="outline" disabled={isBusy} onPress={onClose}>
            {t("importCancel")}
          </Button>
        </>
      }
    >
      <AudiencePillRow>
        <AudiencePill
          isSelected={audience.isFamily}
          onPress={() => setAudience(selectFamilyAudience())}
          hasIcon
          label={t("family")}
        />
        {kidOptions.map((kid) => (
          <AudiencePill
            key={kid.id}
            isSelected={isAudienceKidSelected(audience, kid.id)}
            onPress={() => setAudience((current) => toggleAudienceKid(current, kid.id))}
            initial={kid.name.charAt(0).toUpperCase()}
            label={kid.name}
          />
        ))}
      </AudiencePillRow>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
