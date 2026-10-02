"use client";

/**
 * "Publish to dodi Discover" — the parent-facing end of the publication state
 * machine, opened from a game's actions menu.
 *
 * Publishing is the one moment a game leaves end-to-end encryption, so the flow
 * is explicit about it: the browser decrypts this game and posts the plaintext,
 * the platform stores it as a SEPARATE public copy, and a review pass checks it
 * before it goes live. The parent's own game and its version history stay sealed
 * and keep being editable — re-submitting replaces the copy and re-triggers
 * review.
 *
 * A first publish also asks for the account's public handle, because every real
 * name in dodi is encrypted and a listing can only credit a name the parent
 * deliberately chose for publication.
 *
 * Two modes. A FORM (first submit, changes requested, or an explicit resubmit)
 * asks for input and has a primary submit action. A STATUS view (in review,
 * live, rejected) needs nothing from the parent: its primary action just
 * closes, and resubmitting sits behind a disclosure that spells out its cost,
 * so a waiting parent never mistakes it for the next step.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/shared/icon";
import { AgeRange, isValidAgeRange } from "@/components/parent/games/age-range";
import { PublishRejectionReasons } from "@/components/parent/games/publish-rejection-reasons";
import { PublishStatusStepper } from "@/components/parent/games/publish-status-stepper";
import { PublishStatusView } from "@/components/parent/games/publish-status-view";
import { PublishTranslationsReview } from "@/components/parent/games/publish-translations-review";
import { type NotificationPreferences, useAccountStore } from "@/stores/account-store";
import {
  PUBLICATION_HANDLE_MAX_LENGTH,
  normalizePublicationHandle,
  publicationHandleError,
} from "@dodi/protocol/publication-handle";
import { parseRejectionReasons } from "@dodi/protocol/publication-review";
import {
  type ListingText,
  type PublicationTranslationResult,
  MissingTranslationsError,
  PublicationRequestError,
  canResubmitPublication,
  canSubmitPublication,
  isEditedSinceSubmit as isEditedSince,
  isPublishFormMode,
  loadPublicationStatus,
  publicationErrorKey,
  publicationStateOf,
  publishBadgeKey,
  publishDescriptionKey,
  publishSubmitLabelKey,
  submitPublication,
  withdrawPublication,
} from "@dodi/client-state/game-publication";
import { NoThinkingModelError } from "@/lib/ai/client-generate-text";
import {
  BundleTooLargeError,
  translateGameForPublication,
} from "@/lib/ai/client-translate-game";
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { cn } from "@/lib/utils";
import {
  dialogField,
  formAlert,
  publishBadge,
  publishCallout,
  publishWithdraw,
} from "@dodi/ui-recipes";
import type { Game } from "@dodi/types/database";

interface PublishDialogProps {
  open: boolean;
  /** Stays set while the dialog animates closed, so the content doesn't blank out. */
  gameId: string | null;
  /** False while the game is still an unbuilt placeholder — nothing to publish. */
  built: boolean;
  onClose: () => void;
}

export function PublishDialog({ open, gameId, built, onClose }: PublishDialogProps) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const account = useAccountStore((s) => s.account);
  const loadAccount = useAccountStore((s) => s.load);

  const [publication, setPublication] = useState<Game | null>(null);
  /** Which game `publication` describes — until it matches, we know nothing. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  // Recommended age, pre-filled from the source game and editable here — a last
  // chance to get it right, since it's crucial for a successful publication. On
  // submit these are saved to the game and the public copy inherits them.
  const [ageMin, setAgeMin] = useState(4);
  const [ageMax, setAgeMax] = useState(12);
  // Translate-then-review: the first submit click translates the game into
  // every platform locale (client-side, parent's own provider) and parks the
  // result here; the parent reviews/edits the listing texts, then the second
  // click posts. Null = still in the form stage.
  const [review, setReview] = useState<PublicationTranslationResult | null>(null);
  /** The decrypted source game the review was built from (posted on confirm). */
  const [sourceGame, setSourceGame] = useState<Game | null>(null);
  /** An existing publication's listing rows — paid translations to reuse. */
  const [knownListings, setKnownListings] = useState<Record<string, ListingText>>({});
  /** The source game's head build, compared against the copy's stamp. */
  const [sourceVersionId, setSourceVersionId] = useState<string | null>(null);
  /** The parent chose "Resubmit" from a status view: show the form again. */
  const [isResubmitting, setIsResubmitting] = useState(false);
  /** Withdraw/unpublish asks once before it deletes the copy. */
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState(false);

  useEffect(() => {
    if (open) void loadAccount();
  }, [open, loadAccount]);

  // Read the submission status each time the dialog opens — review may have
  // approved it since the parent last looked.
  useEffect(() => {
    if (!open || !gameId) return;
    let cancelled = false;
    // The age pre-fill reads plaintext columns of the raw row (no vault decrypt).
    loadPublicationStatus(gameFlowDeps(), gameId)
      .then((status) => {
        if (cancelled) return;
        setPublication(status.publication);
        // Paid listing translations to reuse: the live copy's rows, overlaid
        // by the sealed draft (a translate-then-leave round trip, or edits
        // made in the studio settings).
        setKnownListings(status.knownListings);
        if (status.targetAgeMin !== null) setAgeMin(status.targetAgeMin);
        if (status.targetAgeMax !== null) setAgeMax(status.targetAgeMax);
        setSourceVersionId(status.sourceVersionId);
        setIsResubmitting(false);
        setIsConfirmingWithdraw(false);
        setError(null);
        setHandle("");
        setReview(null);
        setSourceGame(null);
        setLoadedFor(gameId);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(gameId);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId]);

  const loaded = loadedFor === gameId;

  // Until this game's status has loaded, show the neutral "not submitted" copy
  // rather than the previous game's badge.
  const state = loaded ? publicationStateOf(publication) : "none";
  const storedHandle = account?.publication_handle ?? null;
  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;

  const submit = useCallback(async () => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      // Handle claim (first publish), recommended age onto the source game,
      // then stage 1 (translate + review) or stage 2 (post the reviewed copy).
      const result = await submitPublication(gameFlowDeps(), {
        gameId,
        storedHandle,
        normalizedHandle: normalized,
        ageMin,
        ageMax,
        review,
        sourceGame,
        knownListings,
        translate: translateGameForPublication,
      });
      if (result.stage === "review") {
        setSourceGame(result.sourceGame);
        setReview(result.review);
        return;
      }
      setPublication(result.publication);
      setSourceVersionId(result.publication.source_game_version_id);
      setIsResubmitting(false);
      setReview(null);
      setSourceGame(null);
    } catch (e) {
      if (e instanceof MissingTranslationsError) {
        setError(t("publishNeedsTranslations"));
      } else if (e instanceof NoThinkingModelError) {
        setError(t("publishNeedsAiKey"));
      } else if (e instanceof BundleTooLargeError) {
        setError(t("publishTooLargeForTranslation"));
      } else if (e instanceof PublicationRequestError) {
        const key = publicationErrorKey(e);
        setError(key ? t(key) : (e.serverError ?? t("publishFailedGeneric")));
      } else {
        setError(e instanceof Error && e.message ? e.message : t("publishFailedGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }, [gameId, normalized, storedHandle, ageMin, ageMax, review, sourceGame, knownListings, t]);

  const withdraw = useCallback(async () => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawPublication(gameFlowDeps(), gameId);
      setPublication(null);
      setIsConfirmingWithdraw(false);
      setIsResubmitting(false);
    } catch (e) {
      setError(
        !(e instanceof PublicationRequestError) && e instanceof Error && e.message
          ? e.message
          : t("publishFailedGeneric"),
      );
    } finally {
      setBusy(false);
    }
  }, [gameId, t]);

  const canSubmit = canSubmitPublication({
    built,
    busy,
    isAgeRangeValid: isValidAgeRange(ageMin, ageMax),
    storedHandle,
    normalizedHandle: normalized,
    hasHandleProblem: Boolean(handleProblem),
    review,
  });
  // A hard rejection is permanent — the platform refuses a resubmit anyway, so
  // don't offer one.
  const canResubmit = canResubmitPublication(state);
  const isFormMode = isPublishFormMode({ state, hasReview: review !== null, isResubmitting });
  const rejectionReasons =
    state === "changes-requested" || state === "rejected"
      ? parseRejectionReasons(publication?.rejection_reasons ?? null)
      : [];
  const isEditedSinceSubmit = isEditedSince(publication, sourceVersionId);
  const prefs = (account?.notification_preferences ?? null) as NotificationPreferences | null;
  const isOutcomeEmailOn = prefs?.publication_outcome_email !== false;
  const monthlyLimit = account?.monthly_game_publication_limit ?? 0;

  const badgeClass = cn(
    publishBadge.box,
    publishBadge.text,
    state === "published"
      ? cn(publishBadge.published, publishBadge.publishedText)
      : state === "rejected"
        ? cn(publishBadge.rejected, publishBadge.rejectedText)
        : cn(publishBadge.pending, publishBadge.pendingText),
  );
  const badgeLabel = t(publishBadgeKey(state));
  const description = t(
    publishDescriptionKey({ state, hasReview: review !== null, isResubmitting }),
  );
  const submitLabel = t(publishSubmitLabelKey({ state, hasReview: review !== null, busy }));

  const openStudio = () => {
    if (!gameId) return;
    onClose();
    router.push(`/parent/game-studio/${gameId}/settings#translations`);
  };

  const withdrawButton = (
    <Button
      variant="ghost"
      className={cn(publishWithdraw.text, publishWithdraw.web)}
      onClick={() => setIsConfirmingWithdraw(true)}
      disabled={busy}
    >
      {state === "published" ? t("publishUnpublish") : t("publishWithdraw")}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("publishTitle")}
            {state !== "none" && <span className={badgeClass}>{badgeLabel}</span>}
          </DialogTitle>
          <DialogDescription>{loaded ? description : t("publishLoading")}</DialogDescription>
        </DialogHeader>

        {loaded && state !== "none" && !review && !isResubmitting && (
          <PublishStatusStepper state={state} />
        )}

        {!review && !isResubmitting && (
          <PublishRejectionReasons reasons={rejectionReasons} isPermanent={state === "rejected"} />
        )}

        {state === "changes-requested" && !review && gameId && (
          <Button variant="outline" className="self-start" onClick={openStudio} disabled={busy}>
            <Icon name="edit" size={16} />
            {t("publishOpenInStudio")}
          </Button>
        )}

        {loaded && !isFormMode && publication && (state === "in-review" || state === "published") && (
          <PublishStatusView
            state={state}
            publication={publication}
            isEditedSinceSubmit={isEditedSinceSubmit}
            isOutcomeEmailOn={isOutcomeEmailOn}
            monthlyLimit={monthlyLimit}
            onResubmit={() => {
              setError(null);
              setIsConfirmingWithdraw(false);
              setIsResubmitting(true);
            }}
          />
        )}

        {review && (
          <PublishTranslationsReview
            review={review}
            disabled={busy}
            onChange={(locale, entry) =>
              setReview((r) =>
                r ? { ...r, translations: { ...r.translations, [locale]: entry } } : r,
              )
            }
          />
        )}

        {isResubmitting && !review && state === "published" && (
          <div
            className={cn(
              publishCallout.web,
              publishCallout.compact,
              publishCallout.warning,
              publishCallout.text,
              publishCallout.bodyText,
            )}
          >
            <Icon name="alert" size={16} className="shrink-0 text-warning" />
            <p>{t("publishResubmitLiveWarning")}</p>
          </div>
        )}

        {isFormMode && !review && loaded && built && canResubmit && (
          <div className={cn(dialogField.web, dialogField.box)}>
            <label className={dialogField.label}>
              {t("recommendedAge")}
            </label>
            <AgeRange
              min={ageMin}
              max={ageMax}
              onMinChange={setAgeMin}
              onMaxChange={setAgeMax}
              minLabel={t("ageMinLabel")}
              maxLabel={t("ageMaxLabel")}
              disabled={busy}
            />
            <p className={dialogField.hint}>
              {isValidAgeRange(ageMin, ageMax) ? (
                t("publishRecommendedAgeHint")
              ) : (
                <span className="text-danger">{t("ageRangeInvalid")}</span>
              )}
            </p>
          </div>
        )}

        {isFormMode && !review && loaded && !storedHandle && (
          <div className={cn(dialogField.web, dialogField.box)}>
            <label className={dialogField.label}>
              {t("publishHandleLabel")}
            </label>
            <Input
              value={handle}
              placeholder={t("publishHandlePlaceholder")}
              // Stop at the limit rather than letting someone type a name they
              // can't have; the regex still guards paste and the API.
              maxLength={PUBLICATION_HANDLE_MAX_LENGTH}
              aria-invalid={handleProblem !== null || undefined}
              onChange={(e) => setHandle(e.target.value)}
            />
            <p className={dialogField.hint}>
              {handleProblem === "reserved"
                ? t("publishHandleReserved")
                : handleProblem === "format"
                  ? t("publishHandleFormat")
                  : t("publishHandleHint")}
            </p>
          </div>
        )}

        {isFormMode && !built && (
          <p className={dialogField.note}>{t("publishNeedsBuild")}</p>
        )}

        {error && (
          <div className={cn(formAlert.box, formAlert.text)}>
            {error}
          </div>
        )}

        {isConfirmingWithdraw && (
          <p role="alert" className={cn(formAlert.box, formAlert.confirmText)}>
            {state === "published" ? t("publishUnpublishConfirm") : t("publishWithdrawConfirm")}
          </p>
        )}

        <DialogFooter>
          {isConfirmingWithdraw ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsConfirmingWithdraw(false)}
                disabled={busy}
              >
                {t("publishKeep")}
              </Button>
              <Button variant="destructive" onClick={withdraw} disabled={busy}>
                {state === "published" ? t("publishUnpublish") : t("publishWithdraw")}
              </Button>
            </>
          ) : review ? (
            <>
              {gameId && (
                // The translations already live in the source game, so leaving for
                // the studio preview loses nothing — publishing resumes free.
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    router.push(`/parent/game-studio/${gameId}/preview`);
                  }}
                >
                  {t("publishReviewInStudio")}
                </Button>
              )}
              <Button onClick={submit} disabled={!canSubmit || !loaded}>
                <Icon name="world_up" size={16} />
                {submitLabel}
              </Button>
            </>
          ) : isFormMode ? (
            <>
              {isResubmitting ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setIsResubmitting(false);
                  }}
                  disabled={busy}
                >
                  {t("publishBack")}
                </Button>
              ) : (
                state === "changes-requested" && withdrawButton
              )}
              <Button onClick={submit} disabled={!canSubmit || !loaded}>
                <Icon name="world_up" size={16} />
                {submitLabel}
              </Button>
            </>
          ) : (
            <>
              {/* Hard-rejected submissions are retained server-side as moderation
                  evidence — withdraw would be a silent no-op, so it isn't offered. */}
              {loaded && state !== "rejected" && withdrawButton}
              <Button onClick={onClose} disabled={busy}>
                {state === "in-review" ? t("publishDone") : t("publishClose")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
