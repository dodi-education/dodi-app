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
import { dodi } from "@/lib/api";
import { type NotificationPreferences, useAccountStore } from "@/stores/account-store";
import {
  decryptGameResponse,
  sealGameFields,
  useGameStore,
} from "@/stores/game-store";
import {
  PUBLICATION_HANDLE_MAX_LENGTH,
  normalizePublicationHandle,
  publicationHandleError,
} from "@dodi/protocol/publication-handle";
import { parseRejectionReasons } from "@dodi/protocol/publication-review";
import { hasTranslationsBlock } from "@dodi/games/translations";
import { toPublicationContent } from "@dodi/vault/game-crypto";
import { NoThinkingModelError } from "@/lib/ai/client-generate-text";
import {
  BundleTooLargeError,
  MissingTranslationsError,
  translateGameForPublication,
  type ListingText,
  type PublicationTranslationResult,
} from "@/lib/ai/client-translate-game";
import {
  knownListingsFrom,
  saveListingDraft,
  type PublicationListingsResponse,
} from "@/lib/games/publication-listings";
import type { Game } from "@dodi/types/database";

type PublicationState =
  | "none"
  | "in-review"
  | "changes-requested"
  | "rejected"
  | "published";

function stateOf(publication: Game | null): PublicationState {
  if (!publication) return "none";
  if (publication.published_at) return "published";
  if (publication.rejected_at) {
    return publication.rejection_kind === "hard" ? "rejected" : "changes-requested";
  }
  return "in-review";
}

/** Submit-error codes the platform returns that have parent-facing copy. */
const SUBMIT_ERROR_KEYS: Record<string, string> = {
  publication_limit_reached: "publishLimitReached",
  publication_hard_rejected: "publishHardBlocked",
  publication_translations_incomplete: "publishTranslationsIncomplete",
};

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
    Promise.all([
      dodi
        .request(`/api/games/${gameId}/publication`)
        .then((r) => (r.ok ? r.json() : { publication: null }))
        .catch(() => ({ publication: null as Game | null })),
      // target_age_* are plaintext columns, so the raw row suffices to pre-fill
      // the range — no vault decrypt needed.
      dodi
        .request(`/api/games/${gameId}`)
        .then((r) => (r.ok ? (r.json() as Promise<Game>) : null))
        .catch(() => null),
    ])
      .then(
        ([pub, game]: [
          { publication: Game | null } & PublicationListingsResponse,
          Game | null,
        ]) => {
          if (cancelled) return;
          setPublication(pub.publication ?? null);
          // Paid listing translations to reuse: the live copy's rows, overlaid
          // by the sealed draft (a translate-then-leave round trip, or edits
          // made in the studio settings).
          setKnownListings(knownListingsFrom(pub));
          if (typeof game?.target_age_min === "number") setAgeMin(game.target_age_min);
          if (typeof game?.target_age_max === "number") setAgeMax(game.target_age_max);
          setSourceVersionId(game?.current_game_version_id ?? null);
          setIsResubmitting(false);
          setIsConfirmingWithdraw(false);
          setError(null);
          setHandle("");
          setReview(null);
          setSourceGame(null);
          setLoadedFor(gameId);
        },
      )
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
  const state = loaded ? stateOf(publication) : "none";
  const storedHandle = account?.publication_handle ?? null;
  const normalized = normalizePublicationHandle(handle);
  const handleProblem = handle ? publicationHandleError(normalized) : null;

  const submit = useCallback(async () => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      // Claim the public byline first — the platform refuses a submission from
      // an account without one.
      if (!storedHandle) {
        const res = await dodi.request("/api/account/publication-handle", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: normalized }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            reason?: string;
          } | null;
          // Only 409/400 mean the name itself was rejected. Anything else is a
          // failed request — saying "that name can't be used" would blame the
          // parent for a server problem and send them renaming in circles.
          if (res.status === 409 || data?.reason === "taken") {
            throw new Error(t("publishHandleTaken"));
          }
          if (res.status === 400) throw new Error(t("publishHandleInvalid"));
          throw new Error(t("publishFailedGeneric"));
        }
        useAccountStore.getState().patchLocal({ publication_handle: normalized });
      }

      // Persist the (possibly edited) recommended age onto the source game
      // first. The public copy inherits plaintext facets from the source row
      // server-side (like tags and duration), so this is how the values travel
      // with the submission — and it keeps the game's own settings in step.
      const ageRes = await dodi.request(`/api/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_age_min: ageMin, target_age_max: ageMax }),
      });
      if (!ageRes.ok) throw new Error(t("publishFailedGeneric"));
      useGameStore
        .getState()
        .patchLocal(gameId, { target_age_min: ageMin, target_age_max: ageMax });

      // Decrypt here and send plaintext: this is the disclosure the parent just
      // consented to. `loadOne` returns the decrypted row from the vault cache.
      const game =
        sourceGame ?? (await useGameStore.getState().loadOne(gameId, undefined, true));
      if (!game) throw new Error(t("publishFailedGeneric"));

      // Stage 1 — translate into every platform locale (client-side, BYOK) and
      // switch to the review stage. Pre-i18n games are stopped before any AI
      // spend or network call: a studio update rebuilds them with the block.
      if (!review) {
        if (!hasTranslationsBlock(game.code_bundle)) {
          throw new MissingTranslationsError();
        }
        const result = await translateGameForPublication(game, { knownListings });

        // The parent paid for these translations, so they belong to THEIR
        // game: persist the translated bundle into the sealed source (head
        // version overwritten — same build, more languages) BEFORE any copy
        // is made. Re-publishing an unedited game then costs nothing, and
        // the studio preview's language picker can show every locale.
        let owned = game;
        if (result.codeBundle !== game.code_bundle) {
          const sealed = await sealGameFields({ code_bundle: result.codeBundle });
          const res = await dodi.request(`/api/games/${gameId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...sealed, create_version: false }),
          });
          if (!res.ok) throw new Error(t("publishFailedGeneric"));
          owned = await decryptGameResponse((await res.json()) as Game);
          useGameStore.getState().put(owned);
        }
        setSourceGame(owned);
        setReview({ ...result, codeBundle: owned.code_bundle });

        // Park the paid listing translations in a DRAFT publication request
        // (sealed — the game is still private) so closing the dialog for a
        // studio review loses nothing. Best-effort: publishing works without.
        try {
          await saveListingDraft(gameId, result.translations);
        } catch {
          /* the draft is an optimization, never a blocker */
        }
        return;
      }

      // Stage 2 — post the translated bundle + the (possibly edited) listings.
      const res = await dodi.request(`/api/games/${gameId}/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...toPublicationContent(game),
          codeBundle: review.codeBundle,
          translations: review.translations,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const errorKey = data?.error ? SUBMIT_ERROR_KEYS[data.error] : undefined;
        if (errorKey) throw new Error(t(errorKey));
        throw new Error(data?.error || t("publishFailedGeneric"));
      }
      const { publication: created } = (await res.json()) as {
        publication: Game;
      };
      setPublication(created);
      setSourceVersionId(created.source_game_version_id);
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
      const res = await dodi.request(`/api/games/${gameId}/publication`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("publishFailedGeneric"));
      setPublication(null);
      setIsConfirmingWithdraw(false);
      setIsResubmitting(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("publishFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }, [gameId, t]);

  const canSubmit =
    built &&
    !busy &&
    isValidAgeRange(ageMin, ageMax) &&
    (storedHandle !== null || (!!normalized && !handleProblem)) &&
    // In the review stage every locale needs a non-empty title.
    (!review ||
      Object.values(review.translations).every((entry) => entry.title.trim().length > 0));
  // A hard rejection is permanent — the platform refuses a resubmit anyway, so
  // don't offer one.
  const canResubmit = state !== "rejected";
  const isFormMode =
    review !== null || state === "none" || state === "changes-requested" || isResubmitting;
  const rejectionReasons =
    state === "changes-requested" || state === "rejected"
      ? parseRejectionReasons(publication?.rejection_reasons ?? null)
      : [];
  // Only a code change counts: the copy's stamp and the source's head build
  // are both known and differ. Copies submitted before the stamp existed
  // (NULL) never show the hint rather than a wrong one.
  const isEditedSinceSubmit =
    publication?.source_game_version_id != null &&
    sourceVersionId !== null &&
    publication.source_game_version_id !== sourceVersionId;
  const prefs = (account?.notification_preferences ?? null) as NotificationPreferences | null;
  const isOutcomeEmailOn = prefs?.publication_outcome_email !== false;
  const monthlyLimit = account?.monthly_game_publication_limit ?? 0;

  const badgeClass =
    state === "published"
      ? "rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary"
      : state === "rejected"
        ? "rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger"
        : "rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning";
  const badgeLabel =
    state === "published"
      ? t("publishLive")
      : state === "rejected"
        ? t("publishRejected")
        : state === "changes-requested"
          ? t("publishChangesRequested")
          : t("publishInReview");
  const description = review
    ? t("publishReviewTranslations")
    : isResubmitting
      ? t("publishResubmitDescription")
      : state === "none"
        ? t("publishDescription")
        : state === "changes-requested"
          ? t("publishReasonsIntro")
          : state === "rejected"
            ? t("publishRejectedHardNotice")
            : state === "published"
              ? t("publishLiveDescription")
              : t("publishSubmitted");
  const submitLabel =
    busy && !review
      ? t("publishTranslating")
      : review
        ? t("publishConfirm")
        : state === "none"
          ? t("publishSubmit")
          : t("publishResubmit");

  const openStudio = () => {
    if (!gameId) return;
    onClose();
    router.push(`/parent/game-studio/${gameId}/settings#translations`);
  };

  const withdrawButton = (
    <Button
      variant="ghost"
      className="text-danger hover:bg-danger-soft hover:text-danger sm:mr-auto"
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
          <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-ink-2">
            <Icon name="alert" size={16} className="shrink-0 text-warning" />
            <p>{t("publishResubmitLiveWarning")}</p>
          </div>
        )}

        {isFormMode && !review && loaded && built && canResubmit && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-2">
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
            <p className="text-[11px] text-faint">
              {isValidAgeRange(ageMin, ageMax) ? (
                t("publishRecommendedAgeHint")
              ) : (
                <span className="text-danger">{t("ageRangeInvalid")}</span>
              )}
            </p>
          </div>
        )}

        {isFormMode && !review && loaded && !storedHandle && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-2">
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
            <p className="text-[11px] text-faint">
              {handleProblem === "reserved"
                ? t("publishHandleReserved")
                : handleProblem === "format"
                  ? t("publishHandleFormat")
                  : t("publishHandleHint")}
            </p>
          </div>
        )}

        {isFormMode && !built && (
          <p className="text-xs text-muted-foreground">{t("publishNeedsBuild")}</p>
        )}

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        {isConfirmingWithdraw && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-ink-2">
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
