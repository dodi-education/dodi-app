"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  createFeedbackDraft,
  submitFeedback,
  type FeedbackContext,
  type FeedbackDraft,
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
import { cn } from "@/lib/utils";

/**
 * "Give feedback": name, category and message to the dodi team (core:
 * feedback). Opened from the parent sidebar, and from a Discover game with
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

  async function handleSubmit(): Promise<void> {
    setIsSending(true);
    const outcome = await submitFeedback({ api: dodi }, draft, "web");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isSending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {isSent ? (
          <p role="status" className={dialogField.note}>
            {t("sent")}
          </p>
        ) : (
          <FeedbackFields draft={draft} disabled={isSending} onChange={update} />
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
              <Button variant="outline" onClick={onClose} disabled={isSending}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={isSending}>
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
