import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { copyOwnedGame, primaryKidIdOf, remixDiscoverGame } from "@dodi/client-state/game-library";

import { Button, Dialog } from "@/components/ui";
import { gameFlowDeps } from "@/lib/game-flow-deps";
import { useKids } from "@/lib/use-kids";

import { FormAlert } from "./form-alert";

/**
 * The confirm dialog both copy paths share: create a private, editable copy
 * under the first kid, then open it in the studio.
 */
function CopyDialog({
  isOpen,
  title,
  onClose,
  createCopy,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  /** Creates the copy under the kid; resolves the new game's id. */
  createCopy: (kidId: string) => Promise<string>;
}) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const { kids } = useKids();
  const primaryKidId = primaryKidIdOf(kids);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setError(null);
  }

  async function confirm(): Promise<void> {
    if (!primaryKidId || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const createdId = await createCopy(primaryKidId);
      onClose();
      router.push(`/parent/game-studio/${createdId}` as Href);
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("discoverRemixTitle")}
      description={t("discoverRemixDescription", { title })}
      footer={
        <>
          <Button icon="copy" isLoading={isBusy} disabled={!primaryKidId} onPress={() => void confirm()}>
            {t("discoverRemixConfirm")}
          </Button>
          <Button variant="outline" disabled={isBusy} onPress={onClose}>
            {t("importCancel")}
          </Button>
        </>
      }
    >
      {!primaryKidId ? <FormAlert>{t("discoverRemixNeedsKid")}</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}

/** Copy an owned studio game: re-read the decrypted row, re-seal, create (web: StudioCopyDialog). */
export function StudioCopyDialog({
  isOpen,
  game,
  onClose,
}: {
  isOpen: boolean;
  game: { id: string; title: string } | null;
  onClose: () => void;
}) {
  return (
    <CopyDialog
      isOpen={isOpen}
      title={game?.title ?? ""}
      onClose={onClose}
      createCopy={(kidId) => {
        if (!game) return Promise.reject(new Error("No game"));
        return copyOwnedGame(gameFlowDeps(), game.id, kidId);
      }}
    />
  );
}

/** Remix a published game: fetch the plaintext detail, re-seal it, create (web: DiscoverRemixDialog). */
export function DiscoverRemixDialog({
  isOpen,
  game,
  onClose,
}: {
  isOpen: boolean;
  game: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const locale = useLocale();
  return (
    <CopyDialog
      isOpen={isOpen}
      title={game?.title ?? ""}
      onClose={onClose}
      createCopy={(kidId) => {
        if (!game) return Promise.reject(new Error("No game"));
        return remixDiscoverGame(gameFlowDeps(), game.id, kidId, locale);
      }}
    />
  );
}
