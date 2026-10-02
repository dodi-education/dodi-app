import { type Href, useRouter } from "expo-router";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  publishBadgeKey,
  publishDescriptionKey,
  publishSubmitLabelKey,
} from "@dodi/client-state/game-publication";
import { parseRejectionReasons } from "@dodi/protocol/publication-review";
import { dialogField, formAlert, publishBadge as b, publishCallout as c } from "@dodi/ui-recipes";

import { Button, Dialog, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { FormAlert } from "./form-alert";
import { PublishFooter } from "./publish-footer";
import { PublishAgeField, PublishHandleField } from "./publish-form-fields";
import { PublishRejectionReasons } from "./publish-rejection-reasons";
import { PublishStatusStepper } from "./publish-status-stepper";
import { PublishStatusView } from "./publish-status-view";
import { PublishTranslationsReview } from "./publish-translations-review";
import { usePublishFlow } from "./use-publish-flow";

/**
 * "Publish to dodi Discover" (web: publish-dialog): the one moment a game
 * leaves end-to-end encryption, so the flow is explicit about it. A FORM
 * (first submit, changes requested, resubmit, translation review) asks for
 * input; a STATUS view (in review, live, rejected) only informs.
 */
export function PublishDialog({
  isOpen,
  gameId,
  isBuilt,
  onClose,
}: {
  isOpen: boolean;
  /** Stays set while the dialog closes, so the content doesn't blank out. */
  gameId: string | null;
  /** False while the game is still an unbuilt placeholder: nothing to publish. */
  isBuilt: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const { height } = useWindowDimensions();
  const flow = usePublishFlow({ isOpen, gameId, isBuilt });
  const { state, review, isLoaded, isBusy, isResubmitting, publication } = flow;

  const rejectionReasons =
    state === "changes-requested" || state === "rejected"
      ? parseRejectionReasons(publication?.rejection_reasons ?? null)
      : [];
  const badge = state === "published" ? b.published : state === "rejected" ? b.rejected : b.pending;
  const badgeText =
    state === "published" ? b.publishedText : state === "rejected" ? b.rejectedText : b.pendingText;
  const description = t(publishDescriptionKey({ state, hasReview: review !== null, isResubmitting }));

  const go = (href: string): void => {
    onClose();
    router.push(href as Href);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("publishTitle")}
      description={isLoaded ? description : t("publishLoading")}
      footer={
        <PublishFooter
          flow={flow}
          gameId={gameId}
          submitLabel={t(publishSubmitLabelKey({ state, hasReview: review !== null, busy: isBusy }))}
          onClose={onClose}
          onReviewInStudio={() => gameId && go(`/parent/game-studio/${gameId}/preview`)}
        />
      }
    >
      <ScrollView style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          {state !== "none" ? (
            <View className={cn(b.box, badge, "self-center")}>
              <Text className={cn(b.text, badgeText)}>{t(publishBadgeKey(state))}</Text>
            </View>
          ) : null}

          {isLoaded && state !== "none" && !review && !isResubmitting ? <PublishStatusStepper state={state} /> : null}

          {!review && !isResubmitting ? (
            <PublishRejectionReasons reasons={rejectionReasons} isPermanent={state === "rejected"} />
          ) : null}

          {state === "changes-requested" && !review && gameId ? (
            <Button
              variant="outline"
              icon="edit"
              className="self-start"
              disabled={isBusy}
              // The web deep-links to #translations; the app opens the settings tab.
              onPress={() => go(`/parent/game-studio/${gameId}/settings`)}
            >
              {t("publishOpenInStudio")}
            </Button>
          ) : null}

          {isLoaded && !flow.isFormMode && publication && (state === "in-review" || state === "published") ? (
            <PublishStatusView
              state={state}
              publication={publication}
              isEditedSinceSubmit={flow.isEditedSinceSubmit}
              isOutcomeEmailOn={flow.isOutcomeEmailOn}
              monthlyLimit={flow.monthlyLimit}
              onResubmit={() => {
                flow.setError(null);
                flow.setIsConfirmingWithdraw(false);
                flow.setIsResubmitting(true);
              }}
              onViewOnDiscover={() => go(`/parent/games/${publication.id}`)}
            />
          ) : null}

          {review ? (
            <PublishTranslationsReview
              review={review}
              disabled={isBusy}
              onChange={(locale, entry) =>
                flow.setReview((r) => (r ? { ...r, translations: { ...r.translations, [locale]: entry } } : r))
              }
            />
          ) : null}

          {isResubmitting && !review && state === "published" ? (
            <View className={cn(c.compact, c.warning)}>
              <Icon name="alert" size={16} color="warning" />
              <Text className={cn(c.text, c.bodyText, "flex-1")}>{t("publishResubmitLiveWarning")}</Text>
            </View>
          ) : null}

          {flow.isFormMode && !review && isLoaded && isBuilt && flow.canResubmit ? (
            <PublishAgeField
              ageMin={flow.ageMin}
              ageMax={flow.ageMax}
              onMinChange={flow.setAgeMin}
              onMaxChange={flow.setAgeMax}
              disabled={isBusy}
            />
          ) : null}

          {flow.isFormMode && !review && isLoaded && !flow.storedHandle ? (
            <PublishHandleField handle={flow.handle} onChange={flow.setHandle} problem={flow.handleProblem} />
          ) : null}

          {flow.isFormMode && !isBuilt ? <Text className={dialogField.note}>{t("publishNeedsBuild")}</Text> : null}

          {flow.error ? <FormAlert>{flow.error}</FormAlert> : null}

          {flow.isConfirmingWithdraw ? (
            <View className={formAlert.box} accessibilityRole="alert">
              <Text className={formAlert.confirmText}>
                {state === "published" ? t("publishUnpublishConfirm") : t("publishWithdrawConfirm")}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Dialog>
  );
}
