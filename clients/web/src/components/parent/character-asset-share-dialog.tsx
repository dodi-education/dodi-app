"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  AssetPublicationRequestError,
  assetPublicationErrorKey,
  canSubmitAssetShare,
  isAssetShareFormMode,
} from "@dodi/client-state/character-asset-publication";
import type { CharacterAssetEntry } from "@dodi/client-state/character-asset-store";
import { normalizePublicationHandle, publicationHandleError } from "@dodi/protocol/publication-handle";
import { dialogField, formAlert } from "@dodi/ui-recipes";

import { CharacterAssetShareFields } from "@/components/parent/character-asset-share-fields";
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
import { useAccountStore } from "@/stores/account-store";
import { useAssetPublicationStore } from "@/stores/character-asset-store";

/**
 * "Share on Discover" for one of the family's own avatars or accessories:
 * the device opens the sealed file and submits a plaintext copy for review
 * (core: character-asset-publication). Shows the state once submitted, with
 * a withdraw (tap twice). Mobile: components/parent/character-asset-share-dialog.
 */
export function CharacterAssetShareDialog({
  asset,
  open,
  onClose,
}: {
  asset: CharacterAssetEntry | null;
  open: boolean;
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
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && asset) {
      setName(asset.name);
      setDescription(asset.meta.description ?? "");
      setHandle("");
      setError(null);
      setIsConfirmingWithdraw(false);
    }
  }

  useEffect(() => {
    if (open) void loadAccount().catch(() => {});
  }, [open, loadAccount]);

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
    <Dialog open={open} onOpenChange={(next) => !next && !isBusy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shareTitle")}</DialogTitle>
          <DialogDescription>{t("shareDescription")}</DialogDescription>
        </DialogHeader>

        {status?.state === "rejected" ? (
          <div className={cn(formAlert.box, formAlert.text)}>
            {status.rejection_reason
              ? t("shareRejectedNotice", { reason: status.rejection_reason })
              : t("shareRejectedNoReason")}
          </div>
        ) : status ? (
          <p className={dialogField.note}>
            {status.state === "live" ? t("shareLiveNotice") : t("shareInReviewNotice")}
          </p>
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

        {isConfirmingWithdraw ? <p className={dialogField.note}>{t("shareConfirmWithdraw")}</p> : null}
        {error ? <div className={cn(formAlert.box, formAlert.text)}>{error}</div> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            {t("shareClose")}
          </Button>
          {status ? (
            <Button variant={isConfirmingWithdraw ? "destructive" : "outline"} onClick={handleWithdraw} disabled={isBusy}>
              {t("shareWithdraw")}
            </Button>
          ) : null}
          {isFormMode ? (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              <Icon name="world_up" size={15} />
              {isBusy ? t("shareSubmitting") : status ? t("shareResubmit") : t("shareSubmit")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
