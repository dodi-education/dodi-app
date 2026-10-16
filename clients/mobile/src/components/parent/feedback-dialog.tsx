import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  createFeedbackDraft,
  feedbackImageSourceError,
  prepareFeedbackImage,
  submitFeedback,
  type FeedbackContext,
  type FeedbackDraft,
  type PrepareFeedbackImageOutcome,
} from "@dodi/client-state/feedback";
import { dialogField } from "@dodi/ui-recipes";

import { nativeImageOps } from "@/adapters/image-ops";
import { pickImageSource } from "@/adapters/pick-images";
import { api } from "@/adapters/platform";
import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog, Text } from "@/components/ui";

import { FeedbackFields } from "./feedback-fields";

/** Pick one image and re-encode it with the image manipulator (core: prepareFeedbackImage). */
async function pickAndPrepare(): Promise<PrepareFeedbackImageOutcome | null> {
  const picked = await pickImageSource().catch(() => null);
  if (!picked) return null;
  const tooLarge = feedbackImageSourceError(picked.byteSize);
  if (tooLarge) return { kind: "error", key: tooLarge };
  return prepareFeedbackImage(nativeImageOps, picked.dataUrl);
}

/**
 * "Give feedback": name, category, message and an optional image to the dodi
 * team (core: feedback). Opened from the drawer, and from a Discover game with the
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
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<FeedbackDraft>(() => createFeedbackDraft(context));
  const [isSending, setIsSending] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
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

  async function attachImage(): Promise<void> {
    setError(null);
    setIsPreparingImage(true);
    const outcome = await pickAndPrepare();
    setIsPreparingImage(false);
    if (!outcome) return;
    if (outcome.kind === "ready") update({ image: outcome.image });
    else setError(t(outcome.key));
  }

  async function handleSubmit(): Promise<void> {
    setIsSending(true);
    const outcome = await submitFeedback({ api }, draft, "mobile");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  const isBusy = isSending || isPreparingImage;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("title")}
      description={t("description")}
      footer={
        isSent ? (
          <Button onPress={onClose}>{tCommon("done")}</Button>
        ) : (
          <>
            <Button icon="send" isLoading={isSending} disabled={isBusy} onPress={() => void handleSubmit()}>
              {isSending ? t("sending") : t("submit")}
            </Button>
            <Button variant="outline" disabled={isBusy} onPress={onClose}>
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
        // The web's dialog scrolls past 85vh; here the form scrolls, which also
        // keeps the message reachable above the keyboard.
        <ScrollView style={{ maxHeight: height * 0.55 }} keyboardShouldPersistTaps="handled">
          <View className="gap-4">
            <FeedbackFields
              draft={draft}
              disabled={isSending}
              isPreparingImage={isPreparingImage}
              onChange={update}
              onPickImage={() => void attachImage()}
            />
          </View>
        </ScrollView>
      )}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
