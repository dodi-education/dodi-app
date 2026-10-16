"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  createFeedbackDraft,
  feedbackImageSourceError,
  prepareFeedbackImage,
  submitFeedback,
  type FeedbackContext,
  type FeedbackDraft,
  type PrepareFeedbackImageOutcome,
} from "@dodi/client-state/feedback";
import { dialogField, formAlert } from "@dodi/ui-recipes";

import { FeedbackFields } from "@/components/parent/feedback-fields";
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
import { downscaleDataUrl, fileToDataUrl } from "@/lib/games/thumbnail";
import { cn } from "@/lib/utils";

/** The canvas re-encodes the picked image (core: prepareFeedbackImage). */
const CANVAS_SCALER = { downscale: downscaleDataUrl };

async function prepareFile(file: File): Promise<PrepareFeedbackImageOutcome> {
  const tooLarge = feedbackImageSourceError(file.size);
  if (tooLarge) return { kind: "error", key: tooLarge };
  const source = await fileToDataUrl(file).catch(() => null);
  if (!source) return { kind: "error", key: "imageUnreadable" };
  return prepareFeedbackImage(CANVAS_SCALER, source);
}

/**
 * "Give feedback": name, category, message and an optional image to the dodi
 * team (core: feedback). Opened from the parent sidebar, and from a Discover game with
 * the category preset to inappropriate content and the game attached (the
 * in-app report path the stores require). Mobile: components/parent/feedback-dialog.
 */
export function FeedbackDialog({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context?: FeedbackContext;
}) {
  const t = useTranslations("feedback");
  const tCommon = useTranslations("common");
  const [draft, setDraft] = useState<FeedbackDraft>(() => createFeedbackDraft(context));
  const [isSending, setIsSending] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start a fresh form from the entry point's context each time the dialog opens
  // (render-phase adjustment). The name stays: it is the same parent.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft((current) => ({ ...createFeedbackDraft(context), senderName: current.senderName }));
      setIsSent(false);
      setError(null);
    }
  }

  function update(patch: Partial<FeedbackDraft>): void {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function attachImage(file: File): Promise<void> {
    setError(null);
    setIsPreparingImage(true);
    const outcome = await prepareFile(file);
    setIsPreparingImage(false);
    if (outcome.kind === "ready") update({ image: outcome.image });
    else setError(t(outcome.key));
  }

  async function handleSubmit(): Promise<void> {
    setIsSending(true);
    const outcome = await submitFeedback({ api: dodi }, draft, "web");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  const isBusy = isSending || isPreparingImage;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isBusy && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {isSent ? (
          <p role="status" className={dialogField.note}>
            {t("sent")}
          </p>
        ) : (
          <FeedbackFields
            draft={draft}
            disabled={isSending}
            isPreparingImage={isPreparingImage}
            onChange={update}
            onAttachImage={(file) => void attachImage(file)}
          />
        )}

        {error ? (
          <div role="alert" className={cn(formAlert.box, formAlert.text)}>
            {error}
          </div>
        ) : null}

        <DialogFooter>
          {isSent ? (
            <Button onClick={onClose}>{tCommon("done")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isBusy}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={isBusy}>
                <Icon name="send" size={15} />
                {isSending ? t("sending") : t("submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
