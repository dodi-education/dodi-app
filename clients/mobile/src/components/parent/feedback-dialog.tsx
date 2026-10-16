import { useState } from "react";
import { useTranslations } from "use-intl";
import {
  createFeedbackDraft,
  submitFeedback,
  type FeedbackContext,
  type FeedbackDraft,
} from "@dodi/client-state/feedback";
import { dialogField } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog, Text } from "@/components/ui";

import { FeedbackFields } from "./feedback-fields";

/**
 * "Give feedback": name, category and message to the dodi team (core:
 * feedback). Opened from the drawer, and from a Discover game with the
 * category preset to inappropriate content and the game attached (the in-app
 * report path the stores require). Web: components/parent/feedback-dialog.
 */
export function FeedbackDialog({
  isOpen,
  onClose,
  context,
}: {
  isOpen: boolean;
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
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
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
    const outcome = await submitFeedback({ api }, draft, "mobile");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isSending) onClose();
      }}
      title={t("title")}
      description={t("description")}
      footer={
        isSent ? (
          <Button onPress={onClose}>{tCommon("done")}</Button>
        ) : (
          <>
            <Button icon="send" isLoading={isSending} disabled={isSending} onPress={() => void handleSubmit()}>
              {isSending ? t("sending") : t("submit")}
            </Button>
            <Button variant="outline" disabled={isSending} onPress={onClose}>
              {tCommon("cancel")}
            </Button>
          </>
        )
      }
    >
      {isSent ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" className={dialogField.note}>
          {t("sent")}
        </Text>
      ) : (
        <FeedbackFields draft={draft} disabled={isSending} onChange={update} />
      )}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
