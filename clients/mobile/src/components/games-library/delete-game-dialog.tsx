import { useState } from "react";
import { useTranslations } from "use-intl";

import { Button, Dialog } from "@/components/ui";

import { FormAlert } from "./form-alert";

/**
 * Confirm deleting a game: it also drops the version history and autosaves,
 * so it is never done straight from the menu (web: game-studio-list).
 */
export function DeleteGameDialog({
  isOpen,
  game,
  onClose,
  onDelete,
}: {
  isOpen: boolean;
  game: { id: string; title: string } | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations("gameStudio");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setError(null);
  }

  async function confirm(): Promise<void> {
    if (!game || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(game.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("deleteFailedGeneric"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) onClose();
      }}
      title={t("deleteTitle")}
      description={t("deleteDescription", { title: game?.title ?? "" })}
      footer={
        <>
          <Button variant="destructive" icon="delete" isLoading={isDeleting} onPress={() => void confirm()}>
            {t("deleteConfirm")}
          </Button>
          <Button variant="outline" disabled={isDeleting} onPress={onClose}>
            {t("deleteCancel")}
          </Button>
        </>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
