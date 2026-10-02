import { useTranslations } from "use-intl";
import { publishWithdraw } from "@dodi/ui-recipes";

import { Button } from "@/components/ui";

import type { usePublishFlow } from "./use-publish-flow";

/**
 * The publish dialog's actions, primary first (the phone dialog stacks them):
 * withdraw confirmation, translation review, form, or status (web: the
 * DialogFooter branches of publish-dialog).
 */
export function PublishFooter({
  flow,
  gameId,
  submitLabel,
  onClose,
  onReviewInStudio,
}: {
  flow: ReturnType<typeof usePublishFlow>;
  gameId: string | null;
  submitLabel: string;
  onClose: () => void;
  onReviewInStudio: () => void;
}) {
  const t = useTranslations("gameStudio");
  const { state, isBusy, isLoaded } = flow;
  const withdrawLabel = state === "published" ? t("publishUnpublish") : t("publishWithdraw");

  const withdrawButton = (
    <Button
      variant="ghost"
      textClassName={publishWithdraw.text}
      iconColor="danger"
      disabled={isBusy}
      onPress={() => flow.setIsConfirmingWithdraw(true)}
    >
      {withdrawLabel}
    </Button>
  );
  const submitButton = (
    <Button icon="world_up" isLoading={isBusy} disabled={!flow.canSubmit || !isLoaded} onPress={() => void flow.submit()}>
      {submitLabel}
    </Button>
  );

  if (flow.isConfirmingWithdraw) {
    return (
      <>
        <Button variant="destructive" isLoading={isBusy} onPress={() => void flow.withdraw()}>
          {withdrawLabel}
        </Button>
        <Button variant="outline" disabled={isBusy} onPress={() => flow.setIsConfirmingWithdraw(false)}>
          {t("publishKeep")}
        </Button>
      </>
    );
  }

  if (flow.review) {
    return (
      <>
        {submitButton}
        {/* The translations already live in the source game, so leaving for
            the studio preview loses nothing: publishing resumes free. */}
        {gameId ? (
          <Button variant="outline" disabled={isBusy} onPress={onReviewInStudio}>
            {t("publishReviewInStudio")}
          </Button>
        ) : null}
      </>
    );
  }

  if (flow.isFormMode) {
    return (
      <>
        {submitButton}
        {flow.isResubmitting ? (
          <Button
            variant="outline"
            disabled={isBusy}
            onPress={() => {
              flow.setError(null);
              flow.setIsResubmitting(false);
            }}
          >
            {t("publishBack")}
          </Button>
        ) : state === "changes-requested" ? (
          withdrawButton
        ) : null}
      </>
    );
  }

  return (
    <>
      <Button disabled={isBusy} onPress={onClose}>
        {state === "in-review" ? t("publishDone") : t("publishClose")}
      </Button>
      {/* Hard-rejected submissions are kept server-side as moderation
          evidence: withdraw would be a silent no-op, so it isn't offered. */}
      {isLoaded && state !== "rejected" ? withdrawButton : null}
    </>
  );
}
