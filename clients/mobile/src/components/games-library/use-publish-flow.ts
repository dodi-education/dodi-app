import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import type { NotificationPreferences } from "@dodi/client-state";
import { isValidAgeRange } from "@dodi/studio/age-range";
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
  submitPublication,
  withdrawPublication,
} from "@dodi/client-state/game-publication";
import { BundleTooLargeError, NoThinkingModelError } from "@dodi/client-state/publication-translation";
import { normalizePublicationHandle, publicationHandleError } from "@dodi/protocol/publication-handle";
import type { Game } from "@dodi/types/database";

import { useAccountStore } from "@/lib/client-state";
import { gameFlowDeps, translateGameForPublication } from "@/lib/game-flow-deps";

/**
 * The publish dialog's UI state around the shared publication flow
 * (`@dodi/client-state/game-publication`), as the web's publish-dialog holds
 * it: status load on open, handle + age form, translate-then-review, submit
 * and withdraw with the same error mapping.
 */
export function usePublishFlow({ isOpen, gameId, isBuilt }: { isOpen: boolean; gameId: string | null; isBuilt: boolean }) {
  const t = useTranslations("gameStudio");
  const account = useAccountStore((s) => s.account);
  const loadAccount = useAccountStore((s) => s.load);

  const [publication, setPublication] = useState<Game | null>(null);
  /** Which game `publication` describes; until it matches, we know nothing. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [ageMin, setAgeMin] = useState(4);
  const [ageMax, setAgeMax] = useState(12);
  const [review, setReview] = useState<PublicationTranslationResult | null>(null);
  const [sourceGame, setSourceGame] = useState<Game | null>(null);
  const [knownListings, setKnownListings] = useState<Record<string, ListingText>>({});
  const [sourceVersionId, setSourceVersionId] = useState<string | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState(false);

  useEffect(() => {
    if (isOpen) void loadAccount();
  }, [isOpen, loadAccount]);

  // Read the submission status each time the dialog opens: review may have
  // approved it since the parent last looked.
  useEffect(() => {
    if (!isOpen || !gameId) return;
    let isCurrent = true;
    loadPublicationStatus(gameFlowDeps(), gameId)
      .then((status) => {
        if (!isCurrent) return;
        setPublication(status.publication);
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
        if (isCurrent) setLoadedFor(gameId);
      });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, gameId]);

  const isLoaded = loadedFor === gameId;
  const state = isLoaded ? publicationStateOf(publication) : "none";
  const storedHandle = account?.publication_handle ?? null;
  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;

  const submit = useCallback(async () => {
    if (!gameId) return;
    setIsBusy(true);
    setError(null);
    try {
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
      if (e instanceof MissingTranslationsError) setError(t("publishNeedsTranslations"));
      else if (e instanceof NoThinkingModelError) setError(t("publishNeedsAiKey"));
      else if (e instanceof BundleTooLargeError) setError(t("publishTooLargeForTranslation"));
      else if (e instanceof PublicationRequestError) {
        const key = publicationErrorKey(e);
        setError(key ? t(key) : (e.serverError ?? t("publishFailedGeneric")));
      } else setError(e instanceof Error && e.message ? e.message : t("publishFailedGeneric"));
    } finally {
      setIsBusy(false);
    }
  }, [gameId, normalized, storedHandle, ageMin, ageMax, review, sourceGame, knownListings, t]);

  const withdraw = useCallback(async () => {
    if (!gameId) return;
    setIsBusy(true);
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
      setIsBusy(false);
    }
  }, [gameId, t]);

  const prefs = (account?.notification_preferences ?? null) as NotificationPreferences | null;

  return {
    publication,
    isLoaded,
    state,
    isBusy,
    error,
    setError,
    handle,
    setHandle,
    handleProblem,
    storedHandle,
    ageMin,
    setAgeMin,
    ageMax,
    setAgeMax,
    review,
    setReview,
    isResubmitting,
    setIsResubmitting,
    isConfirmingWithdraw,
    setIsConfirmingWithdraw,
    submit,
    withdraw,
    canSubmit: canSubmitPublication({
      built: isBuilt,
      busy: isBusy,
      isAgeRangeValid: isValidAgeRange(ageMin, ageMax),
      storedHandle,
      normalizedHandle: normalized,
      hasHandleProblem: Boolean(handleProblem),
      review,
    }),
    // A hard rejection is permanent: the platform refuses a resubmit anyway.
    canResubmit: canResubmitPublication(state),
    isFormMode: isPublishFormMode({ state, hasReview: review !== null, isResubmitting }),
    isEditedSinceSubmit: isEditedSince(publication, sourceVersionId),
    isOutcomeEmailOn: prefs?.publication_outcome_email !== false,
    monthlyLimit: account?.monthly_game_publication_limit ?? 0,
  };
}
