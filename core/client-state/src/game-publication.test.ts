import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { VaultSession } from "@dodi/vault";
import type { Game } from "@dodi/types/database";

import type { AccountState, AccountStore } from "./account-store";
import {
  type PublicationTranslationResult,
  MissingTranslationsError,
  PublicationRequestError,
  REVIEW_SLOW_AFTER_MS,
  canResubmitPublication,
  canSubmitPublication,
  claimPublicationHandle,
  fetchKnownListings,
  isEditedSinceSubmit,
  isPublicationReviewSlow,
  isPublishFormMode,
  knownListingsFrom,
  loadPublicationStatus,
  publicationErrorKey,
  publicationStateOf,
  publishBadgeKey,
  publishDescriptionKey,
  publishStepStatuses,
  publishSubmitLabelKey,
  saveListingDraft,
  submitPublication,
  withdrawPublication,
} from "./game-publication";
import { createGameCrypto, type GameStore, type GameStoreState } from "./game-store";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

type Route = Response | Error | ((init?: RequestInit) => Response);

/** Routes by "METHOD path" first, then by path. */
function routedApi(routes: Record<string, Route>): PlatformApi & {
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      const route = routes[`${init?.method ?? "GET"} ${path}`] ?? routes[path];
      if (!route) throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
      if (route instanceof Error) throw route;
      return typeof route === "function" ? route(init) : route;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function calls(api: { request: ReturnType<typeof vi.fn> }): string[] {
  return api.request.mock.calls.map(
    ([path, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${path}`,
  );
}

function bodyOf(
  api: { request: ReturnType<typeof vi.fn> },
  methodPath: string,
): Record<string, unknown> {
  const call = api.request.mock.calls.find(
    ([p, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${p}` === methodPath,
  );
  if (!call) throw new Error(`no call to ${methodPath}`);
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

const TRANSLATED_BUNDLE =
  '<html><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{},"de":{}}}</script></html>';

const GAME = {
  id: "g1",
  title: "Counting Comets",
  description: "Count them",
  code_bundle: "<html>with translations</html>",
  markdown: "",
  learning_goal: "",
  success_definition: "",
  success_criteria: null,
  preview_image: null,
} as unknown as Game;

function setup(options: { session?: VaultSession | null; game?: Game | null } = {}) {
  const session =
    options.session === undefined ? new VaultSession(new Uint8Array(32).fill(3)) : options.session;
  const vault = createStore(
    () => ({ session, status: session ? "unlocked" : "locked" }) as unknown as VaultState,
  ) as VaultStore;
  const loadOne = vi.fn(async () => (options.game === undefined ? GAME : options.game));
  const patchLocal = vi.fn();
  const put = vi.fn();
  const games = createStore(
    () => ({ loadOne, patchLocal, put }) as unknown as GameStoreState,
  ) as GameStore;
  const patchAccount = vi.fn();
  const account = createStore(
    () => ({ patchLocal: patchAccount }) as unknown as AccountState,
  ) as AccountStore;
  return {
    session,
    vault,
    games,
    loadOne,
    patchLocal,
    put,
    account,
    patchAccount,
    gameCrypto: createGameCrypto(vault),
  };
}

const row = (fields: Partial<Game>): Game => ({ ...GAME, ...fields }) as Game;

describe("status derivations", () => {
  it("derives the state from the public copy", () => {
    expect(publicationStateOf(null)).toBe("none");
    expect(publicationStateOf(row({ published_at: "x" }))).toBe("published");
    expect(publicationStateOf(row({ rejected_at: "x", rejection_kind: "hard" }))).toBe("rejected");
    expect(publicationStateOf(row({ rejected_at: "x", rejection_kind: "soft" }))).toBe(
      "changes-requested",
    );
    expect(publicationStateOf(row({ published_at: null, rejected_at: null }))).toBe("in-review");
  });

  it("maps states onto the stepper", () => {
    expect(publishStepStatuses("in-review")).toEqual(["done", "current", "upcoming"]);
    expect(publishStepStatuses("changes-requested")).toEqual(["done", "warning", "upcoming"]);
    expect(publishStepStatuses("rejected")).toEqual(["done", "danger", "upcoming"]);
    expect(publishStepStatuses("published")).toEqual(["done", "done", "done"]);
  });

  it("flags a slow review only while in review", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    const old = new Date(now - REVIEW_SLOW_AFTER_MS - 1).toISOString();
    const fresh = new Date(now - 60_000).toISOString();
    expect(isPublicationReviewSlow("in-review", old, now)).toBe(true);
    expect(isPublicationReviewSlow("in-review", fresh, now)).toBe(false);
    expect(isPublicationReviewSlow("published", old, now)).toBe(false);
    expect(isPublicationReviewSlow("in-review", null, now)).toBe(false);
  });

  it("only counts a known, differing build as edited", () => {
    expect(isEditedSinceSubmit(row({ source_game_version_id: "v1" }), "v2")).toBe(true);
    expect(isEditedSinceSubmit(row({ source_game_version_id: "v1" }), "v1")).toBe(false);
    expect(isEditedSinceSubmit(row({ source_game_version_id: null }), "v2")).toBe(false);
    expect(isEditedSinceSubmit(row({ source_game_version_id: "v1" }), null)).toBe(false);
    expect(isEditedSinceSubmit(null, "v1")).toBe(false);
  });

  it("chooses form vs status mode and resubmit", () => {
    const base = { hasReview: false, isResubmitting: false };
    expect(isPublishFormMode({ ...base, state: "none" })).toBe(true);
    expect(isPublishFormMode({ ...base, state: "changes-requested" })).toBe(true);
    expect(isPublishFormMode({ ...base, state: "in-review" })).toBe(false);
    expect(isPublishFormMode({ ...base, state: "published", isResubmitting: true })).toBe(true);
    expect(isPublishFormMode({ ...base, state: "published", hasReview: true })).toBe(true);
    expect(canResubmitPublication("rejected")).toBe(false);
    expect(canResubmitPublication("published")).toBe(true);
  });

  it("gates the submit button", () => {
    const base = {
      built: true,
      busy: false,
      isAgeRangeValid: true,
      storedHandle: null,
      normalizedHandle: "comet_kid",
      hasHandleProblem: false,
      review: null,
    };
    expect(canSubmitPublication(base)).toBe(true);
    expect(canSubmitPublication({ ...base, built: false })).toBe(false);
    expect(canSubmitPublication({ ...base, busy: true })).toBe(false);
    expect(canSubmitPublication({ ...base, isAgeRangeValid: false })).toBe(false);
    expect(canSubmitPublication({ ...base, normalizedHandle: "" })).toBe(false);
    expect(canSubmitPublication({ ...base, hasHandleProblem: true })).toBe(false);
    expect(canSubmitPublication({ ...base, normalizedHandle: "", storedHandle: "me" })).toBe(true);
    const review: PublicationTranslationResult = {
      sourceLocale: "en",
      codeBundle: "",
      translations: { en: { title: "A", description: "" }, de: { title: " ", description: "" } },
    };
    expect(canSubmitPublication({ ...base, review })).toBe(false);
    review.translations.de.title = "B";
    expect(canSubmitPublication({ ...base, review })).toBe(true);
  });

  it("picks the dialog's message keys", () => {
    expect(publishBadgeKey("published")).toBe("publishLive");
    expect(publishBadgeKey("rejected")).toBe("publishRejected");
    expect(publishBadgeKey("changes-requested")).toBe("publishChangesRequested");
    expect(publishBadgeKey("in-review")).toBe("publishInReview");
    const d = { hasReview: false, isResubmitting: false };
    expect(publishDescriptionKey({ ...d, state: "none", hasReview: true })).toBe(
      "publishReviewTranslations",
    );
    expect(publishDescriptionKey({ ...d, state: "none", isResubmitting: true })).toBe(
      "publishResubmitDescription",
    );
    expect(publishDescriptionKey({ ...d, state: "none" })).toBe("publishDescription");
    expect(publishDescriptionKey({ ...d, state: "changes-requested" })).toBe("publishReasonsIntro");
    expect(publishDescriptionKey({ ...d, state: "rejected" })).toBe("publishRejectedHardNotice");
    expect(publishDescriptionKey({ ...d, state: "published" })).toBe("publishLiveDescription");
    expect(publishDescriptionKey({ ...d, state: "in-review" })).toBe("publishSubmitted");
    expect(publishSubmitLabelKey({ state: "none", hasReview: false, busy: true })).toBe(
      "publishTranslating",
    );
    expect(publishSubmitLabelKey({ state: "none", hasReview: true, busy: true })).toBe(
      "publishConfirm",
    );
    expect(publishSubmitLabelKey({ state: "none", hasReview: false, busy: false })).toBe(
      "publishSubmit",
    );
    expect(publishSubmitLabelKey({ state: "published", hasReview: false, busy: false })).toBe(
      "publishResubmit",
    );
  });

  it("maps request failures to message keys", () => {
    expect(publicationErrorKey(new PublicationRequestError("handle-taken"))).toBe(
      "publishHandleTaken",
    );
    expect(publicationErrorKey(new PublicationRequestError("handle-invalid"))).toBe(
      "publishHandleInvalid",
    );
    expect(publicationErrorKey(new PublicationRequestError("failed"))).toBe("publishFailedGeneric");
    expect(
      publicationErrorKey(
        new PublicationRequestError("submit-rejected", "publication_limit_reached"),
      ),
    ).toBe("publishLimitReached");
    expect(publicationErrorKey(new PublicationRequestError("submit-rejected"))).toBe(
      "publishFailedGeneric",
    );
    const unmapped = new PublicationRequestError("submit-rejected", "Something odd");
    expect(publicationErrorKey(unmapped)).toBeNull();
    expect(unmapped.message).toBe("Something odd");
  });
});

describe("listing texts", () => {
  it("overlays the sealed draft on the live rows; ignores an unreadable draft", () => {
    const { session } = setup();
    const response = {
      translations: [
        { locale: "en", title: "Live EN", description: "en" },
        { locale: "de", title: "Live DE", description: "de" },
      ] as never,
      draftListingTranslationsEnc: session!.encryptJson({ de: { title: "Draft DE", description: "d" } }),
    };
    expect(knownListingsFrom(response, session)).toEqual({
      en: { title: "Live EN", description: "en" },
      de: { title: "Draft DE", description: "d" },
    });
    expect(knownListingsFrom({ ...response, draftListingTranslationsEnc: "enc:v1:bad" }, session)).toEqual({
      en: { title: "Live EN", description: "en" },
      de: { title: "Live DE", description: "de" },
    });
    expect(knownListingsFrom(response, null).de.title).toBe("Live DE");
  });

  it("seals the draft (ciphertext only) and refuses when locked", async () => {
    const { vault, session } = setup();
    const api = routedApi({ "PUT /api/games/g1/publication/draft": json({}) });
    const listings = { en: { title: "T", description: "D" } };
    await saveListingDraft({ api, vault }, "g1", listings);
    const sealed = String(bodyOf(api, "PUT /api/games/g1/publication/draft").listingTranslationsEnc);
    expect(sealed).toMatch(/^enc:v1:/);
    expect(session!.decryptJson(sealed)).toEqual(listings);

    const locked = setup({ session: null });
    await expect(saveListingDraft({ api, vault: locked.vault }, "g1", listings)).rejects.toThrow(
      "Vault is locked",
    );
  });

  it("fetches known listings, throwing on HTTP errors", async () => {
    const { vault } = setup();
    const api = routedApi({
      "/api/games/g1/publication": json({ translations: [{ locale: "en", title: "A", description: "B" }] }),
    });
    await expect(fetchKnownListings({ api, vault }, "g1")).resolves.toEqual({
      en: { title: "A", description: "B" },
    });
    const failing = routedApi({ "/api/games/g1/publication": json({}, 500) });
    await expect(fetchKnownListings({ api: failing, vault }, "g1")).rejects.toThrow("(500)");
  });
});

describe("load", () => {
  it("reads the copy, known listings, age and head build", async () => {
    const { vault } = setup();
    const publication = row({ id: "pub-1" });
    const api = routedApi({
      "/api/games/g1/publication": json({
        publication,
        translations: [{ locale: "en", title: "A", description: "B" }],
      }),
      "/api/games/g1": json({ target_age_min: 5, target_age_max: 9, current_game_version_id: "v3" }),
    });
    await expect(loadPublicationStatus({ api, vault }, "g1")).resolves.toEqual({
      publication,
      knownListings: { en: { title: "A", description: "B" } },
      targetAgeMin: 5,
      targetAgeMax: 9,
      sourceVersionId: "v3",
    });
  });

  it("treats failed reads as not submitted / unknown", async () => {
    const { vault } = setup();
    const api = routedApi({
      "/api/games/g1/publication": new TypeError("offline"),
      "/api/games/g1": json({}, 500),
    });
    await expect(loadPublicationStatus({ api, vault }, "g1")).resolves.toEqual({
      publication: null,
      knownListings: {},
      targetAgeMin: null,
      targetAgeMax: null,
      sourceVersionId: null,
    });
  });
});

describe("submit", () => {
  const translateTo = (codeBundle: string) =>
    vi.fn(
      async (): Promise<PublicationTranslationResult> => ({
        sourceLocale: "en",
        codeBundle,
        translations: { en: { title: "Comets", description: "Count" } },
      }),
    );

  it("claims the handle, saves the age, translates, persists the sealed bundle and parks the draft", async () => {
    const ctx = setup({ game: { ...GAME, code_bundle: TRANSLATED_BUNDLE.replace(',"de":{}', "") } as Game });
    const api = routedApi({
      "PUT /api/account/publication-handle": json({}),
      "PATCH /api/games/g1": (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        // The age PATCH echoes nothing useful; the bundle PATCH returns the sealed row.
        return json({ ...GAME, code_bundle: body.code_bundle ?? GAME.code_bundle });
      },
      "PUT /api/games/g1/publication/draft": json({}),
    });
    const translate = translateTo(TRANSLATED_BUNDLE);
    const result = await submitPublication(
      { api, ...ctx },
      {
        gameId: "g1",
        storedHandle: null,
        normalizedHandle: "comet_kid",
        ageMin: 5,
        ageMax: 9,
        review: null,
        sourceGame: null,
        knownListings: { de: { title: "K", description: "Z" } },
        translate,
      },
    );
    expect(calls(api)).toEqual([
      "PUT /api/account/publication-handle",
      "PATCH /api/games/g1",
      "PATCH /api/games/g1",
      "PUT /api/games/g1/publication/draft",
    ]);
    expect(ctx.patchAccount).toHaveBeenCalledWith({ publication_handle: "comet_kid" });
    expect(ctx.patchLocal).toHaveBeenCalledWith("g1", { target_age_min: 5, target_age_max: 9 });
    expect(ctx.loadOne).toHaveBeenCalledWith("g1", undefined, true);
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }), {
      knownListings: { de: { title: "K", description: "Z" } },
    });
    // The translated bundle goes back into the source SEALED, as the same version.
    const bundlePatch = api.request.mock.calls[2][1] as RequestInit;
    const patched = JSON.parse(String(bundlePatch.body)) as Record<string, unknown>;
    expect(patched.create_version).toBe(false);
    expect(String(patched.code_bundle)).toMatch(/^enc:v1:/);
    expect(ctx.put).toHaveBeenCalledWith(expect.objectContaining({ code_bundle: TRANSLATED_BUNDLE }));
    expect(result).toMatchObject({
      stage: "review",
      review: { codeBundle: TRANSLATED_BUNDLE, sourceLocale: "en" },
      sourceGame: { code_bundle: TRANSLATED_BUNDLE },
    });
  });

  it("skips the bundle write when nothing changed and survives a failed draft", async () => {
    const game = { ...GAME, code_bundle: TRANSLATED_BUNDLE } as Game;
    const ctx = setup({ game });
    const api = routedApi({
      "PATCH /api/games/g1": json({}),
      "PUT /api/games/g1/publication/draft": json({}, 500),
    });
    const result = await submitPublication(
      { api, ...ctx },
      {
        gameId: "g1",
        storedHandle: "me",
        normalizedHandle: "",
        ageMin: 4,
        ageMax: 8,
        review: null,
        sourceGame: null,
        knownListings: {},
        translate: translateTo(TRANSLATED_BUNDLE),
      },
    );
    expect(calls(api)).toEqual(["PATCH /api/games/g1", "PUT /api/games/g1/publication/draft"]);
    expect(ctx.put).not.toHaveBeenCalled();
    expect(result.stage).toBe("review");
  });

  it("stops pre-i18n games before any AI spend", async () => {
    const ctx = setup({ game: { ...GAME, code_bundle: "<html>old</html>" } as Game });
    const api = routedApi({ "PATCH /api/games/g1": json({}) });
    const translate = translateTo("");
    await expect(
      submitPublication(
        { api, ...ctx },
        {
          gameId: "g1",
          storedHandle: "me",
          normalizedHandle: "",
          ageMin: 4,
          ageMax: 8,
          review: null,
          sourceGame: null,
          knownListings: {},
          translate,
        },
      ),
    ).rejects.toBeInstanceOf(MissingTranslationsError);
    expect(translate).not.toHaveBeenCalled();
  });

  it("posts the reviewed plaintext disclosure", async () => {
    const ctx = setup();
    const publication = row({ id: "pub-1", source_game_version_id: "v2" });
    const api = routedApi({
      "PATCH /api/games/g1": json({}),
      "POST /api/games/g1/publication": json({ publication }),
    });
    const review: PublicationTranslationResult = {
      sourceLocale: "en",
      codeBundle: TRANSLATED_BUNDLE,
      translations: { en: { title: "Edited", description: "D" } },
    };
    const sourceGame = { ...GAME, code_bundle: TRANSLATED_BUNDLE } as Game;
    const result = await submitPublication(
      { api, ...ctx },
      {
        gameId: "g1",
        storedHandle: "me",
        normalizedHandle: "",
        ageMin: 4,
        ageMax: 8,
        review,
        sourceGame,
        knownListings: {},
        translate: translateTo(""),
      },
    );
    expect(result).toEqual({ stage: "submitted", publication });
    expect(ctx.loadOne).not.toHaveBeenCalled();
    expect(bodyOf(api, "POST /api/games/g1/publication")).toEqual({
      title: "Counting Comets",
      description: "Count them",
      codeBundle: TRANSLATED_BUNDLE,
      markdown: "",
      learningGoal: "",
      successDefinition: "",
      successCriteria: null,
      previewImage: null,
      translations: review.translations,
    });
  });

  it("reports why a submission was refused", async () => {
    const ctx = setup();
    const review: PublicationTranslationResult = { sourceLocale: "en", codeBundle: "", translations: {} };
    const input = {
      gameId: "g1",
      storedHandle: "me",
      normalizedHandle: "",
      ageMin: 4,
      ageMax: 8,
      review,
      sourceGame: GAME,
      knownListings: {},
      translate: translateTo(""),
    };
    const refused = routedApi({
      "PATCH /api/games/g1": json({}),
      "POST /api/games/g1/publication": json({ error: "publication_limit_reached" }, 429),
    });
    const error = await submitPublication({ api: refused, ...ctx }, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublicationRequestError);
    expect((error as PublicationRequestError).serverError).toBe("publication_limit_reached");

    const ageFails = routedApi({ "PATCH /api/games/g1": json({}, 500) });
    const ageError = await submitPublication({ api: ageFails, ...ctx }, input).catch((e: unknown) => e);
    expect((ageError as PublicationRequestError).failure).toBe("failed");
    expect(calls(ageFails)).toEqual(["PATCH /api/games/g1"]);
  });

  it("blames the handle only for 409/400", async () => {
    const { account } = setup();
    const claim = (res: Response) =>
      claimPublicationHandle(
        { api: routedApi({ "PUT /api/account/publication-handle": res }), account },
        "x",
      ).catch((e: unknown) => (e as PublicationRequestError).failure);
    await expect(claim(json({}, 409))).resolves.toBe("handle-taken");
    await expect(claim(json({ reason: "taken" }, 422))).resolves.toBe("handle-taken");
    await expect(claim(json({}, 400))).resolves.toBe("handle-invalid");
    await expect(claim(json({}, 500))).resolves.toBe("failed");
  });

  it("withdraws the public copy", async () => {
    const api = routedApi({ "DELETE /api/games/g1/publication": json({}) });
    await withdrawPublication({ api }, "g1");
    expect(calls(api)).toEqual(["DELETE /api/games/g1/publication"]);
    const failing = routedApi({ "DELETE /api/games/g1/publication": json({}, 500) });
    await expect(withdrawPublication({ api: failing }, "g1")).rejects.toBeInstanceOf(
      PublicationRequestError,
    );
  });
});
