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
import { dodi } from "@/lib/api";
import { useAccountStore } from "@/stores/account-store";
import {
  decryptGameResponse,
  sealGameFields,
  useGameStore,
} from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";
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
import type { Game, GameTranslation } from "@dodi/types/database";

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
          {
            publication: Game | null;
            translations?: GameTranslation[];
            draftListingTranslationsEnc?: string | null;
          },
          Game | null,
        ]) => {
          if (cancelled) return;
          setPublication(pub.publication ?? null);
          // Paid listing translations to reuse: the live copy's rows, and —
          // fresher, from a translate-then-leave round trip — the sealed
          // draft blob (decrypted in the unlocked vault; ignored when sealed
          // by a different key state or malformed).
          let draftListings: Record<string, ListingText> = {};
          try {
            draftListings =
              useVaultStore
                .getState()
                .session?.decryptJson<Record<string, ListingText>>(
                  pub.draftListingTranslationsEnc,
                ) ?? {};
          } catch {
            draftListings = {};
          }
          setKnownListings({
            ...Object.fromEntries(
              (pub.translations ?? []).map((row) => [
                row.locale,
                { title: row.title, description: row.description },
              ]),
            ),
            ...draftListings,
          });
          if (typeof game?.target_age_min === "number") setAgeMin(game.target_age_min);
          if (typeof game?.target_age_max === "number") setAgeMax(game.target_age_max);
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
          const session = useVaultStore.getState().session;
          if (session) {
            await dodi.request(`/api/games/${gameId}/publication/draft`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingTranslationsEnc: session.encryptJson(result.translations),
              }),
            });
          }
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
  // don't offer one. Soft rejection keeps the button as the "fix and resubmit".
  const canResubmit = state !== "rejected";
  const rejectionReasons =
    state === "changes-requested" || state === "rejected"
      ? parseRejectionReasons(publication?.rejection_reasons ?? null)
      : [];

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
          <DialogDescription>
            {review
              ? t("publishReviewTranslations")
              : state === "none"
                ? t("publishDescription")
                : state === "changes-requested"
                  ? t("publishReasonsIntro")
                  : state === "rejected"
                    ? t("publishRejectedHardNotice")
                    : t("publishSubmitted")}
          </DialogDescription>
        </DialogHeader>

        {rejectionReasons.length > 0 && (
          <ul className="flex flex-col gap-2">
            {rejectionReasons.map((reason, i) => (
              <li
                key={`${reason.code}-${i}`}
                className={
                  state === "rejected"
                    ? "rounded-lg bg-danger-soft px-3 py-2 text-xs"
                    : "rounded-lg bg-warning-soft px-3 py-2 text-xs"
                }
              >
                <span
                  className={
                    state === "rejected"
                      ? "font-semibold text-danger"
                      : "font-semibold text-warning"
                  }
                >
                  {t(`publishReason_${reason.code}`)}
                </span>
                {reason.note && (
                  <p className="mt-0.5 text-muted-foreground">{reason.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {review && (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              {t("publishReviewTranslationsHint")}
            </p>
            {Object.entries(review.translations).map(([locale, entry]) => {
              const isSource = locale === review.sourceLocale;
              return (
                <div key={locale} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase text-ink-2">
                    {locale}
                    {isSource && (
                      <span className="ml-1.5 normal-case text-faint">
                        {t("publishSourceLanguage")}
                      </span>
                    )}
                  </label>
                  <Input
                    value={entry.title}
                    disabled={isSource || busy}
                    maxLength={200}
                    aria-label={t("publishTranslatedTitle", { locale })}
                    onChange={(e) =>
                      setReview((r) =>
                        r
                          ? {
                              ...r,
                              translations: {
                                ...r.translations,
                                [locale]: { ...entry, title: e.target.value },
                              },
                            }
                          : r,
                      )
                    }
                  />
                  <textarea
                    value={entry.description}
                    disabled={isSource || busy}
                    maxLength={5000}
                    rows={2}
                    aria-label={t("publishTranslatedDescription", { locale })}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(e) =>
                      setReview((r) =>
                        r
                          ? {
                              ...r,
                              translations: {
                                ...r.translations,
                                [locale]: { ...entry, description: e.target.value },
                              },
                            }
                          : r,
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {!review && loaded && built && canResubmit && (
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

        {!review && state === "none" && !storedHandle && (
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

        {!built && (
          <p className="text-xs text-muted-foreground">{t("publishNeedsBuild")}</p>
        )}

        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          {/* Hard-rejected submissions are retained server-side as moderation
              evidence — withdraw would be a silent no-op, so it isn't offered. */}
          {!review && state !== "none" && state !== "rejected" && (
            <Button variant="outline" onClick={withdraw} disabled={busy}>
              {t("publishWithdraw")}
            </Button>
          )}
          {review && gameId && (
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
          {canResubmit && (
            <Button onClick={submit} disabled={!canSubmit || !loaded}>
              <Icon name="world_up" size={16} />
              {busy && !review
                ? t("publishTranslating")
                : review
                  ? t("publishConfirm")
                  : state === "none"
                    ? t("publishSubmit")
                    : t("publishResubmit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
