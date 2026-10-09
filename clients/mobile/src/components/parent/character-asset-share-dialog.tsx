import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import {
  AssetPublicationRequestError,
  assetPublicationErrorKey,
  canSubmitAssetShare,
  isAssetShareFormMode,
} from "@dodi/client-state/character-asset-publication";
import type { CharacterAssetEntry } from "@dodi/client-state/character-asset-store";
import { normalizePublicationHandle, publicationHandleError } from "@dodi/protocol/publication-handle";
import { dialogField } from "@dodi/ui-recipes";

import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog, Text } from "@/components/ui";
import { useAccountStore, useAssetPublicationStore } from "@/lib/client-state";

import { CharacterAssetShareFields } from "./character-asset-share-fields";

/**
 * "Share on Discover" for one of the family's own avatars or accessories:
 * the device opens the sealed file and submits a plaintext copy for review
 * (core: character-asset-publication). Shows the state once submitted, with
 * a withdraw (tap twice). Web: components/parent/character-asset-share-dialog.
 */
export function CharacterAssetShareDialog({
  asset,
  isOpen,
  onClose,
}: {
  asset: CharacterAssetEntry | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("characterAssets");
  const status = useAssetPublicationStore((s) => (asset ? s.byAssetId[asset.id] : undefined));
  const submit = useAssetPublicationStore((s) => s.submit);
  const withdraw = useAssetPublicationStore((s) => s.withdraw);
  const storedHandle = useAccountStore((s) => s.account?.publication_handle ?? null);
  const loadAccount = useAccountStore((s) => s.load);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handle, setHandle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from the asset each time the dialog opens (render-phase adjustment).
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && asset) {
      setName(asset.name);
      setDescription(asset.meta.description ?? "");
      setHandle("");
      setError(null);
      setIsConfirmingWithdraw(false);
    }
  }

  useEffect(() => {
    if (isOpen) void loadAccount().catch(() => {});
  }, [isOpen, loadAccount]);

  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;
  const isFormMode = isAssetShareFormMode(status);
  const canSubmit = canSubmitAssetShare({
    name,
    storedHandle,
    normalizedHandle: normalized,
    hasHandleProblem: handleProblem !== null,
    isBusy,
  });

  async function run(action: () => Promise<unknown>): Promise<void> {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(assetPublicationErrorKey(e instanceof AssetPublicationRequestError ? e.failure : "failed")));
    } finally {
      setIsBusy(false);
    }
  }

  function handleSubmit(): void {
    if (!asset || !canSubmit) return;
    void run(() => submit(asset.id, { name, description, ...(storedHandle ? {} : { handle: normalized }) }));
  }

  function handleWithdraw(): void {
    if (!asset) return;
    if (!isConfirmingWithdraw) {
      setIsConfirmingWithdraw(true);
      return;
    }
    setIsConfirmingWithdraw(false);
    void run(() => withdraw(asset.id));
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("shareTitle")}
      description={t("shareDescription")}
      footer={
        <>
          {isFormMode ? (
            <Button icon="world_up" isLoading={isBusy} disabled={!canSubmit} onPress={handleSubmit}>
              {status ? t("shareResubmit") : t("shareSubmit")}
            </Button>
          ) : null}
          {status ? (
            <Button
              variant={isConfirmingWithdraw ? "destructive" : "outline"}
              disabled={isBusy}
              onPress={handleWithdraw}
            >
              {t("shareWithdraw")}
            </Button>
          ) : null}
          <Button variant="outline" disabled={isBusy} onPress={onClose}>
            {t("shareClose")}
          </Button>
        </>
      }
    >
      {status?.state === "rejected" ? (
        <FormAlert>
          {status.rejection_reason
            ? t("shareRejectedNotice", { reason: status.rejection_reason })
            : t("shareRejectedNoReason")}
        </FormAlert>
      ) : status ? (
        <Text className={dialogField.note}>
          {status.state === "live" ? t("shareLiveNotice") : t("shareInReviewNotice")}
        </Text>
      ) : null}

      {isFormMode ? (
        <CharacterAssetShareFields
          name={name}
          description={description}
          handle={handle}
          isHandleNeeded={!storedHandle}
          handleProblem={handleProblem}
          disabled={isBusy}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onHandleChange={setHandle}
        />
      ) : null}

      {isConfirmingWithdraw ? <Text className={dialogField.note}>{t("shareConfirmWithdraw")}</Text> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
