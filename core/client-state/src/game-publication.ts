/**
 * Publishing a game to dodi Discover: the parent-facing end of the
 * publication state machine.
 *
 * Publishing is the one moment a game leaves end-to-end encryption, so the
 * device decrypts the game and posts the plaintext; the platform stores it as
 * a SEPARATE public copy (a fork) that a review pass checks before it goes
 * live. The parent's own game and its version history stay sealed.
 *
 * Translate-then-review: the first submit translates the game into every
 * platform locale (client-side, the parent's own provider, injected as
 * `translate`), persists the translated bundle into the SEALED source game and
 * parks the listing texts in a sealed draft; the parent reviews the listings,
 * then the second submit posts. Clients render the dialog and map the typed
 * errors to copy.
 */
import type { Game, GameTranslation } from "@dodi/types/database";
import { hasTranslationsBlock } from "@dodi/games/translations";
import { toPublicationContent } from "@dodi/vault/game-crypto";
import type { VaultSession } from "@dodi/vault";

import type { AccountStore } from "./account-store";
import type { GameCrypto, GameStore } from "./game-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

/** One locale's Discover listing. */
export interface ListingText {
  title: string;
  description: string;
}

export interface PublicationTranslationResult {
  /** The game's own (platform-normalized) locale. */
  sourceLocale: string;
  /** The bundle with the translations block covering every platform locale. */
  codeBundle: string;
  /** Per-locale listing content, INCLUDING the source locale's own entry. */
  translations: Record<string, ListingText>;
}

/** The game predates the translations contract: rebuild it in the studio first. */
export class MissingTranslationsError extends Error {
  constructor() {
    super("Game bundle has no translations block");
    this.name = "MissingTranslationsError";
  }
}

/** The client's publish-translate step (AI, the parent's own key). */
export type TranslateForPublication = (
  game: Game,
  options: { knownListings?: Record<string, ListingText> },
) => Promise<PublicationTranslationResult>;

export interface PublicationDeps {
  api: PlatformApi;
  games: GameStore;
  gameCrypto: GameCrypto;
  vault: VaultStore;
  account: AccountStore;
}

// ── Status derivations ───────────────────────────────────────────────────────

export type PublicationState =
  | "none"
  | "in-review"
  | "changes-requested"
  | "rejected"
  | "published";

/** Where a submission stands (null = never submitted / withdrawn). */
export function publicationStateOf(publication: Game | null): PublicationState {
  if (!publication) return "none";
  if (publication.published_at) return "published";
  if (publication.rejected_at) {
    return publication.rejection_kind === "hard" ? "rejected" : "changes-requested";
  }
  return "in-review";
}

/** A submitted state, as the three-step track (Submitted → Review → Live) shows it. */
export type PublishStepperState = Exclude<PublicationState, "none">;

export type PublishStepStatus = "done" | "current" | "warning" | "danger" | "upcoming";

/** Each step's status for a submitted state. */
export function publishStepStatuses(
  state: PublishStepperState,
): [PublishStepStatus, PublishStepStatus, PublishStepStatus] {
  switch (state) {
    case "in-review":
      return ["done", "current", "upcoming"];
    case "changes-requested":
      return ["done", "warning", "upcoming"];
    case "rejected":
      return ["done", "danger", "upcoming"];
    case "published":
      return ["done", "done", "done"];
  }
}

/**
 * The review worker runs every 10 minutes and gives up on an item after three
 * failed agent attempts, which then waits for a person. Past this age a
 * submission is stuck rather than queued, and the copy says so.
 */
export const REVIEW_SLOW_AFTER_MS = 60 * 60 * 1000;

/** An in-review submission older than {@link REVIEW_SLOW_AFTER_MS}. */
export function isPublicationReviewSlow(
  state: PublicationState,
  requestedAt: string | null,
  now: number,
): boolean {
  return (
    state === "in-review" &&
    requestedAt !== null &&
    now - new Date(requestedAt).getTime() > REVIEW_SLOW_AFTER_MS
  );
}

/**
 * Only a code change counts: the copy's stamp and the source's head build are
 * both known and differ. Copies submitted before the stamp existed (NULL)
 * never show the hint rather than a wrong one.
 */
export function isEditedSinceSubmit(
  publication: Game | null,
  sourceVersionId: string | null,
): boolean {
  return (
    publication?.source_game_version_id != null &&
    sourceVersionId !== null &&
    publication.source_game_version_id !== sourceVersionId
  );
}

/** A hard rejection is permanent: the platform refuses a resubmit anyway. */
export function canResubmitPublication(state: PublicationState): boolean {
  return state !== "rejected";
}

/**
 * FORM mode (first submit, changes requested, an explicit resubmit, or the
 * review stage) asks for input; otherwise the dialog shows a read-only STATUS.
 */
export function isPublishFormMode(input: {
  state: PublicationState;
  hasReview: boolean;
  isResubmitting: boolean;
}): boolean {
  return (
    input.hasReview ||
    input.state === "none" ||
    input.state === "changes-requested" ||
    input.isResubmitting
  );
}

/** Whether the submit action is enabled. */
export function canSubmitPublication(input: {
  built: boolean;
  busy: boolean;
  isAgeRangeValid: boolean;
  storedHandle: string | null;
  normalizedHandle: string;
  hasHandleProblem: boolean;
  review: PublicationTranslationResult | null;
}): boolean {
  return (
    input.built &&
    !input.busy &&
    input.isAgeRangeValid &&
    (input.storedHandle !== null || (!!input.normalizedHandle && !input.hasHandleProblem)) &&
    // In the review stage every locale needs a non-empty title.
    (!input.review ||
      Object.values(input.review.translations).every((entry) => entry.title.trim().length > 0))
  );
}

/** `gameStudio` message key of the status badge. */
export function publishBadgeKey(state: PublicationState): string {
  if (state === "published") return "publishLive";
  if (state === "rejected") return "publishRejected";
  if (state === "changes-requested") return "publishChangesRequested";
  return "publishInReview";
}

/** `gameStudio` message key of the dialog description. */
export function publishDescriptionKey(input: {
  state: PublicationState;
  hasReview: boolean;
  isResubmitting: boolean;
}): string {
  if (input.hasReview) return "publishReviewTranslations";
  if (input.isResubmitting) return "publishResubmitDescription";
  switch (input.state) {
    case "none":
      return "publishDescription";
    case "changes-requested":
      return "publishReasonsIntro";
    case "rejected":
      return "publishRejectedHardNotice";
    case "published":
      return "publishLiveDescription";
    case "in-review":
      return "publishSubmitted";
  }
}

/** `gameStudio` message key of the submit button. */
export function publishSubmitLabelKey(input: {
  state: PublicationState;
  hasReview: boolean;
  busy: boolean;
}): string {
  if (input.busy && !input.hasReview) return "publishTranslating";
  if (input.hasReview) return "publishConfirm";
  return input.state === "none" ? "publishSubmit" : "publishResubmit";
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type PublicationFailure =
  /** The handle is already claimed by another account. */
  | "handle-taken"
  /** The platform rejected the handle's format. */
  | "handle-invalid"
  /** The platform refused the submission (see `serverError`). */
  | "submit-rejected"
  /** Any other failed request. */
  | "failed";

/** A failed publication request, with a reason the client maps to copy. */
export class PublicationRequestError extends Error {
  constructor(
    readonly failure: PublicationFailure,
    /** The platform's error code / text, for `submit-rejected`. */
    readonly serverError?: string,
  ) {
    super(serverError || failure);
    this.name = "PublicationRequestError";
  }
}

/** Submit-error codes the platform returns that have parent-facing copy. */
export const PUBLISH_SUBMIT_ERROR_KEYS: Record<string, string> = {
  publication_limit_reached: "publishLimitReached",
  publication_hard_rejected: "publishHardBlocked",
  publication_translations_incomplete: "publishTranslationsIncomplete",
};

/**
 * The `gameStudio` message key for a failed request; null when the platform's
 * own `serverError` text is the message (an unmapped submit refusal).
 */
export function publicationErrorKey(error: PublicationRequestError): string | null {
  switch (error.failure) {
    case "handle-taken":
      return "publishHandleTaken";
    case "handle-invalid":
      return "publishHandleInvalid";
    case "failed":
      return "publishFailedGeneric";
    case "submit-rejected": {
      if (!error.serverError) return "publishFailedGeneric";
      return PUBLISH_SUBMIT_ERROR_KEYS[error.serverError] ?? null;
    }
  }
}

// ── Listing texts ────────────────────────────────────────────────────────────

/** The listing-related part of `GET /api/games/{id}/publication`. */
export interface PublicationListingsResponse {
  translations?: GameTranslation[];
  draftListingTranslationsEnc?: string | null;
}

/**
 * The per-locale listing texts already known for a game: the live copy's rows,
 * overlaid by the fresher sealed draft (a translate-then-leave round trip, or
 * edits made in the studio settings). The draft is decrypted in the unlocked
 * vault and ignored when it can't be (no session, other key, malformed).
 */
export function knownListingsFrom(
  response: PublicationListingsResponse,
  session: VaultSession | null,
): Record<string, ListingText> {
  let draftListings: Record<string, ListingText> = {};
  try {
    draftListings =
      session?.decryptJson<Record<string, ListingText>>(response.draftListingTranslationsEnc) ??
      {};
  } catch {
    draftListings = {};
  }
  return {
    ...Object.fromEntries(
      (response.translations ?? []).map((row) => [
        row.locale,
        { title: row.title, description: row.description },
      ]),
    ),
    ...draftListings,
  };
}

/** Fetch a game's known listing texts (see {@link knownListingsFrom}). */
export async function fetchKnownListings(
  deps: Pick<PublicationDeps, "api" | "vault">,
  gameId: string,
): Promise<Record<string, ListingText>> {
  const res = await deps.api.request(`/api/games/${gameId}/publication`);
  if (!res.ok) throw new Error(`Failed to load listing translations (${res.status})`);
  return knownListingsFrom(
    (await res.json()) as PublicationListingsResponse,
    deps.vault.getState().session,
  );
}

/**
 * Seal the listing texts into the game's DRAFT publication request. The game
 * is still E2EE-private at this point, so the server only ever sees ciphertext;
 * the next (re)submit picks the texts up via {@link knownListingsFrom}.
 */
export async function saveListingDraft(
  deps: Pick<PublicationDeps, "api" | "vault">,
  gameId: string,
  listings: Record<string, ListingText>,
): Promise<void> {
  const session = deps.vault.getState().session;
  if (!session) throw new Error("Vault is locked");
  const res = await deps.api.request(`/api/games/${gameId}/publication/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingTranslationsEnc: session.encryptJson(listings) }),
  });
  if (!res.ok) throw new Error(`Failed to save listing translations (${res.status})`);
}

// ── Load ─────────────────────────────────────────────────────────────────────

export interface PublicationStatus {
  /** The public copy (null = not submitted). */
  publication: Game | null;
  /** Paid listing translations to reuse. */
  knownListings: Record<string, ListingText>;
  /** The source game's recommended age (plaintext columns), when known. */
  targetAgeMin: number | null;
  targetAgeMax: number | null;
  /** The source game's head build, compared against the copy's stamp. */
  sourceVersionId: string | null;
}

/**
 * Read a game's submission status (each time the dialog opens: review may
 * have approved it since). A failed read counts as "not submitted". The age
 * columns are plaintext, so the raw row suffices; no vault decrypt.
 */
export async function loadPublicationStatus(
  deps: Pick<PublicationDeps, "api" | "vault">,
  gameId: string,
): Promise<PublicationStatus> {
  type PublicationResponse = { publication: Game | null } & PublicationListingsResponse;
  const [pub, game] = await Promise.all([
    deps.api
      .request(`/api/games/${gameId}/publication`)
      .then((r) => (r.ok ? (r.json() as Promise<PublicationResponse>) : { publication: null }))
      .catch((): PublicationResponse => ({ publication: null })),
    deps.api
      .request(`/api/games/${gameId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Game>) : null))
      .catch(() => null),
  ]);
  return {
    publication: pub.publication ?? null,
    knownListings: knownListingsFrom(pub, deps.vault.getState().session),
    targetAgeMin: typeof game?.target_age_min === "number" ? game.target_age_min : null,
    targetAgeMax: typeof game?.target_age_max === "number" ? game.target_age_max : null,
    sourceVersionId: game?.current_game_version_id ?? null,
  };
}

// ── Submit / withdraw ────────────────────────────────────────────────────────

/**
 * Claim the account's public byline (every real name in dodi is encrypted, so
 * a listing can only credit a name chosen for publication) and mirror it into
 * the cached account. Only 409/400 blame the name; anything else is a failed
 * request, so the parent isn't sent renaming in circles.
 */
export async function claimPublicationHandle(
  deps: Pick<PublicationDeps, "api" | "account">,
  normalizedHandle: string,
): Promise<void> {
  const res = await deps.api.request("/api/account/publication-handle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: normalizedHandle }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { reason?: string } | null;
    if (res.status === 409 || data?.reason === "taken") {
      throw new PublicationRequestError("handle-taken");
    }
    if (res.status === 400) throw new PublicationRequestError("handle-invalid");
    throw new PublicationRequestError("failed");
  }
  deps.account.getState().patchLocal({ publication_handle: normalizedHandle });
}

/**
 * Persist the (possibly edited) recommended age onto the source game. The
 * public copy inherits plaintext facets from the source row server-side, so
 * this is how the values travel with the submission.
 */
export async function saveRecommendedAge(
  deps: Pick<PublicationDeps, "api" | "games">,
  gameId: string,
  ageMin: number,
  ageMax: number,
): Promise<void> {
  const res = await deps.api.request(`/api/games/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_age_min: ageMin, target_age_max: ageMax }),
  });
  if (!res.ok) throw new PublicationRequestError("failed");
  deps.games.getState().patchLocal(gameId, { target_age_min: ageMin, target_age_max: ageMax });
}

export interface PublicationReview {
  /** The decrypted source game the review was built from (posted on confirm). */
  sourceGame: Game;
  review: PublicationTranslationResult;
}

/**
 * Stage 1: translate a DECRYPTED game into every platform locale. Pre-i18n
 * games are stopped before any AI spend. The parent paid for the
 * translations, so a changed bundle is sealed back into THEIR game (head
 * version overwritten: same build, more languages) before any copy is made,
 * and the listings are parked in a sealed draft (best-effort).
 */
export async function preparePublicationReview(
  deps: PublicationDeps,
  input: {
    gameId: string;
    game: Game;
    knownListings: Record<string, ListingText>;
    translate: TranslateForPublication;
  },
): Promise<PublicationReview> {
  const { gameId, game } = input;
  if (!hasTranslationsBlock(game.code_bundle)) throw new MissingTranslationsError();
  const result = await input.translate(game, { knownListings: input.knownListings });

  let owned = game;
  if (result.codeBundle !== game.code_bundle) {
    const sealed = await deps.gameCrypto.sealGameFields({ code_bundle: result.codeBundle });
    const res = await deps.api.request(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sealed, create_version: false }),
    });
    if (!res.ok) throw new PublicationRequestError("failed");
    owned = await deps.gameCrypto.decryptGameResponse((await res.json()) as Game);
    deps.games.getState().put(owned);
  }

  try {
    await saveListingDraft(deps, gameId, result.translations);
  } catch {
    /* the draft is an optimization, never a blocker */
  }
  return { sourceGame: owned, review: { ...result, codeBundle: owned.code_bundle } };
}

/**
 * Stage 2: post the plaintext disclosure (the decrypted game, the translated
 * bundle and the possibly edited listings). The platform forks it into the
 * public copy. Resolves that copy.
 */
export async function postPublication(
  deps: Pick<PublicationDeps, "api">,
  gameId: string,
  game: Game,
  review: PublicationTranslationResult,
): Promise<Game> {
  const res = await deps.api.request(`/api/games/${gameId}/publication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...toPublicationContent(game),
      codeBundle: review.codeBundle,
      translations: review.translations,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new PublicationRequestError("submit-rejected", data?.error);
  }
  const { publication } = (await res.json()) as { publication: Game };
  return publication;
}

export type PublicationSubmitResult =
  | ({ stage: "review" } & PublicationReview)
  | { stage: "submitted"; publication: Game };

/**
 * One press of the submit button: claim the handle when the account has none,
 * save the recommended age, decrypt the game, then either translate (no
 * review yet) or post the reviewed submission.
 */
export async function submitPublication(
  deps: PublicationDeps,
  input: {
    gameId: string;
    /** The account's current handle; null claims `normalizedHandle` first. */
    storedHandle: string | null;
    normalizedHandle: string;
    ageMin: number;
    ageMax: number;
    /** The review from a previous press (null = translate now). */
    review: PublicationTranslationResult | null;
    /** The source game that review was built from. */
    sourceGame: Game | null;
    knownListings: Record<string, ListingText>;
    translate: TranslateForPublication;
  },
): Promise<PublicationSubmitResult> {
  const { gameId } = input;
  if (!input.storedHandle) await claimPublicationHandle(deps, input.normalizedHandle);
  await saveRecommendedAge(deps, gameId, input.ageMin, input.ageMax);

  // Decrypt here and send plaintext: the disclosure the parent just consented to.
  const game = input.sourceGame ?? (await deps.games.getState().loadOne(gameId, undefined, true));
  if (!game) throw new PublicationRequestError("failed");

  if (!input.review) {
    const prepared = await preparePublicationReview(deps, {
      gameId,
      game,
      knownListings: input.knownListings,
      translate: input.translate,
    });
    return { stage: "review", ...prepared };
  }
  const publication = await postPublication(deps, gameId, game, input.review);
  return { stage: "submitted", publication };
}

/** Withdraw a submission / unpublish: the platform deletes the public copy. */
export async function withdrawPublication(
  deps: Pick<PublicationDeps, "api">,
  gameId: string,
): Promise<void> {
  const res = await deps.api.request(`/api/games/${gameId}/publication`, { method: "DELETE" });
  if (!res.ok) throw new PublicationRequestError("failed");
}
