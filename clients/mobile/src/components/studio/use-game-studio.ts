/**
 * The Game Studio screen's state and actions (web: the body of
 * components/parent/games/game-studio.tsx, in its phone layout). Logic lives
 * in @dodi/studio; this hook holds the screen's UI state, calls the core and
 * hands builds to the device's build store, exactly as the web screen does.
 */
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { extractTranslations, hasTranslationsBlock } from "@dodi/games/translations";
import { normalizeLocale } from "@dodi/intl/locales";
import type { ResumableBuild } from "@dodi/studio/build-manager";
import {
  SCREENSHOT_BOUND,
  type StudioBuildOutcome,
  type StudioBuildTexts,
  type StudioKid,
} from "@dodi/studio/build-runner";
import {
  type DraftView,
  EMPTY_PLANNING,
  type PlanningState,
  resolveInitialView,
  restorePlanning,
} from "@dodi/studio/plan-state";
import {
  findInvalidSettings,
  type InvalidSettings,
  invalidSettingsList,
  planSettingsSave,
  resolveDraftGate,
} from "@dodi/studio/settings-save";
import type { SketchStroke } from "@dodi/studio/sketch-strokes";
import { checkStudioProviders, persistTranscript, setGameActive } from "@dodi/studio/studio-editor";
import { emptyStudioGame, resolvePrimaryKidId, type StudioGame, type StudioView } from "@dodi/studio/studio-game";
import { gameAfterBuild } from "@dodi/studio/studio-outcome";
import { type PlanSurface, resolveStudioPanes, type StudioTab } from "@dodi/studio/studio-panes";
import { applyPlanSettings, derivePlanSettingsForStudio, runPlanTurn } from "@dodi/studio/studio-plan";
import { createGameFromSettings, mapSettingsSuccessDefinition, patchGameSettings } from "@dodi/studio/studio-settings";
import { restoreTranscript, type StudioChatMessage } from "@dodi/studio/transcript";
import type { AgentStep } from "@dodi/types/agent-progress";

import { mobileStudioEditorPorts as editorPorts } from "@/adapters/studio-ports";
import type { GameSandboxHandle } from "@/components/games/game-sandbox";
import { nativeImageOps } from "@/adapters/image-ops";
import { holdBackgroundWork } from "@/lib/background-work";
import { useBreadcrumbStore } from "@/lib/breadcrumb-store";
import { useAccountStore, useKidStore, useVaultStore } from "@/lib/client-state";
import { pickImages, takePhoto } from "@/adapters/pick-images";
import { studioBuildStore, useStudioBuild } from "@/lib/studio-build-store";

import { useStepLabel } from "./step-labels";
import { useListingTranslations } from "./use-listing-translations";
import { usePlanningWriter } from "./use-planning-writer";
import { useStudioVersions } from "./use-studio-versions";

/** Max reference images a single message can carry. */
export const MAX_ATTACHMENTS = 3;
/** Reference images: the web's addImages bound. */
const ATTACHMENT_BOUND = { maxWidth: 1024, maxHeight: 1024, quality: 0.8 } as const;
/** A worksheet photo for the Plan step: the web's onPhotoPicked bound. */
const PLAN_PHOTO_BOUND = { maxWidth: 1280, maxHeight: 1280, quality: 0.8 } as const;
/** Report a settings save that has not finished after this long. */
const SAVE_STALL_MS = 20_000;

function capImages(existing: string[], incoming: string[], max: number): string[] {
  return [...existing, ...incoming].slice(0, max);
}

/** The studio route for a game (deep links and notifications land here). */
function studioHref(gameId: string, view?: StudioView): `/parent/game-studio/${string}` {
  return view ? `/parent/game-studio/${gameId}/${view}` : `/parent/game-studio/${gameId}`;
}

export interface GameStudioInput {
  initialGame?: StudioGame;
  /** Tab from the route; falls back to preview for a saved game, settings for a draft. */
  initialView?: StudioView;
}

export function useGameStudio({ initialGame, initialView }: GameStudioInput) {
  const t = useTranslations("gameStudio");
  const tBackground = useTranslations("backgroundBuild");
  const locale = useLocale();
  const isEditing = Boolean(initialGame?.id);

  // Kid names are vault-encrypted at rest; the store decrypts them on the device.
  const kidRows = useKidStore((s) => s.list);
  const loadKids = useKidStore((s) => s.loadList);
  const session = useVaultStore((s) => s.session);
  useEffect(() => {
    if (kidRows === null) void loadKids().catch(() => {});
  }, [kidRows, loadKids, session]);
  const kids: StudioKid[] = useMemo(
    () =>
      (kidRows ?? []).map((p) => ({
        id: p.id,
        name: p.display_name,
        birthdate: p.birthdate,
        memory: p.memory,
        parent_notes: p.parent_notes,
        language: p.language,
      })),
    [kidRows],
  );

  const [game, setGame] = useState<StudioGame>(initialGame ?? emptyStudioGame());
  // The live id: adopted in place when a planned draft is first written.
  const gameIdRef = useRef<string | null>(initialGame?.id ?? null);

  // The live game title is the page title in the shell's breadcrumbs.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(game.title.trim() || t("addGame"));
    return () => setLeaf(null);
  }, [game.title, setLeaf, t]);

  // The persisted Plan step, unsealed once on mount.
  const [restoredPlanning] = useState<PlanningState | null>(() =>
    restorePlanning(initialGame?.planEnc, useVaultStore.getState().session),
  );
  const [view, setView] = useState<DraftView>(() =>
    resolveInitialView({ initialView, hasId: Boolean(initialGame?.id), planning: restoredPlanning }),
  );

  const listingTranslations = useListingTranslations(game.id, view === "settings");
  const listingSourceLocale = useMemo(() => {
    if (view !== "settings" || !game.codeBundle) return null;
    const source = extractTranslations(game.codeBundle).translations?.sourceLocale;
    return source ? normalizeLocale(source) : null;
  }, [view, game.codeBundle]);

  // The thread: the unsealed prior conversation (resume), or empty.
  const [localMessages, setMessages] = useState<StudioChatMessage[]>(() =>
    restoreTranscript(useVaultStore.getState().session, initialGame?.agentTranscriptEnc),
  );
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  // Work this screen runs itself: a plan turn, or the save that starts a build.
  const [isLocalBusy, setIsLocalBusy] = useState(false);
  const [localNarration, setNarration] = useState("");

  // This game's build, if one runs on this device (the store owns it).
  const activeBuild = useStudioBuild((s) => (s.active && s.active.gameId === game.id ? s.active : null));
  const pendingOutcome = useStudioBuild((s) => (game.id ? s.outcomes[game.id] : undefined));
  const isOtherBuildRunning = useStudioBuild((s) => s.active !== null && s.active.gameId !== game.id);
  const [isStartingBuildRun, setIsStartingBuildRun] = useState(false);
  const isThinking = isLocalBusy || isStartingBuildRun || activeBuild !== null;
  const step: AgentStep | null = activeBuild?.step ?? null;
  const narration = activeBuild ? activeBuild.narration : localNarration;
  const writeChars = activeBuild?.writeChars ?? 0;
  const liveRun = activeBuild?.runLog ?? null;
  const messages = activeBuild?.transcript ?? pendingOutcome?.transcript ?? localMessages;
  const [resumable, setResumable] = useState<ResumableBuild | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bgNotice, setBgNotice] = useState<"skipped" | "failed" | null>(null);
  const [previewNotice, setPreviewNotice] = useState<"skipped" | "failed" | null>(null);
  const [hasVisualCheckNotice, setHasVisualCheckNotice] = useState(false);
  const loadAccount = useAccountStore((s) => s.load);
  const [invalid, setInvalid] = useState<InvalidSettings>({});
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingBuild, setIsStartingBuild] = useState(false);

  // ----- Plan step -------------------------------------------------------
  const [isPlanning, setIsPlanning] = useState(() => !initialGame?.id || restoredPlanning !== null);
  const planning0 = restoredPlanning ?? EMPTY_PLANNING;
  const [planMode, setPlanMode] = useState<"draw" | "photo">(planning0.mode);
  const [sketchImage, setSketchImage] = useState<string | null>(planning0.sketchImage);
  const [photoImage, setPhotoImage] = useState<string | null>(planning0.photoImage);
  const [sketchStrokes, setSketchStrokes] = useState<SketchStroke[]>(planning0.sketchStrokes);
  const [planDraft, setPlanDraft] = useState(planning0.summary);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [acceptedPlan, setAcceptedPlan] = useState<string | null>(planning0.isAccepted ? planning0.summary : null);
  const [isDerivingSettings, setIsDerivingSettings] = useState(false);
  const [hasUnsentPlanImage, setHasUnsentPlanImage] = useState(false);
  const pendingAutoBuildRef = useRef<{ text: string; images: string[] } | null>(null);
  // The id was adopted in place (not routed): the finished save/build hands the route over.
  const adoptedIdRef = useRef(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  // null = still loading, so the warning doesn't flash before we know.
  const [hasGameProvider, setHasGameProvider] = useState<boolean | null>(null);
  const [hasImageProvider, setHasImageProvider] = useState<boolean | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [isClearOpen, setIsClearOpen] = useState(false);
  // The app is the web's vertical (phone) layout.
  const vertical = true;
  const [mtab, setMtab] = useState<StudioTab>(initialGame?.id ? "chat" : "game");
  const [planSurface, setPlanSurface] = useState<PlanSurface>("chat");
  const [isAttachSheetOpen, setIsAttachSheetOpen] = useState(false);
  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isPlanMode = isPlanning && view === "plan";
  const { isPaneLocked, isComposerLocked } = resolveDraftGate({ isPlanning, isPlanMode, isStartingBuild });
  const hasPlan = planDraft.trim().length > 0;
  const isMobilePlan = vertical && isPlanMode;
  const isMobileSurfaceOpen = isMobilePlan && planSurface !== "chat";
  const panes = resolveStudioPanes({ vertical, locked: isPaneLocked, isPlanMode, mtab, planSurface });

  const saveFailedMessage = (reason: string): string =>
    reason ? t("saveFailed", { reason }) : t("saveFailedGeneric");

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const needsGameProvider = hasGameProvider === false;
  const isComposerLockedNow = isComposerLocked || needsGameProvider;

  // Is a game generation model configured (and an image model with its key)?
  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const check = await checkStudioProviders(editorPorts, (hasGame) => {
        if (!isCancelled) setHasGameProvider(hasGame);
      });
      if (isCancelled) return;
      setHasGameProvider(check.hasGameProvider);
      setHasImageProvider(check.hasImageProvider);
      // New games default both image generations on, once an image provider is confirmed.
      if (check.hasImageProvider && !isEditing) {
        setGame((g) => (g.id ? g : { ...g, generatePreviewImage: true, generateBackgroundImage: true }));
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [isEditing]);

  const setField = <K extends keyof StudioGame>(key: K, value: StudioGame[K]): void => {
    setGame((g) => ({ ...g, [key]: value }));
    if (key === "title" || key === "learningGoal") setInvalid((v) => ({ ...v, [key]: false }));
    if (key === "targetAgeMin" || key === "targetAgeMax") setInvalid((v) => ({ ...v, age: false }));
  };

  // ----- Audience and preview language -------------------------------------
  const primaryKidId = resolvePrimaryKidId(game, kids);
  const [previewLocaleChoice, setPreviewLocaleChoice] = useState<string | null>(null);
  const previewLocale =
    previewLocaleChoice ?? normalizeLocale(kids.find((k) => k.id === primaryKidId)?.language ?? locale);
  const previewHasTranslations = game.codeBundle ? hasTranslationsBlock(game.codeBundle) : false;
  const selectFamily = (): void => {
    setGame((g) => ({ ...g, isFamily: true, audienceIds: [] }));
    setInvalid((v) => ({ ...v, audience: false }));
  };
  const toggleKid = (id: string): void => {
    setGame((g) => {
      const has = g.audienceIds.includes(id);
      return {
        ...g,
        isFamily: false,
        audienceIds: has ? g.audienceIds.filter((x) => x !== id) : [...g.audienceIds, id],
      };
    });
    setInvalid((v) => ({ ...v, audience: false }));
  };

  // ----- Plan step persistence -------------------------------------------
  const reportSaveError = (err: unknown, name?: string): void => {
    editorPorts.telemetry.reportError({
      context: "game_save",
      kidId: primaryKidId,
      gameId: gameIdRef.current,
      error: name && err instanceof Error ? Object.assign(err, { name }) : err,
      secrets: [],
    });
  };

  const planningWriter = usePlanningWriter({
    isPlanning,
    planning: {
      summary: planDraft,
      isAccepted: acceptedPlan !== null,
      mode: planMode,
      sketchImage,
      photoImage,
      sketchStrokes,
    },
    messages,
    game,
    kids,
    gameIdRef,
    onCreated: (gameId) => {
      // Adopt the id in place: a navigation would remount the studio and take
      // the live thread, the sketch and a running plan turn with it.
      adoptedIdRef.current = true;
      gameIdRef.current = gameId;
      setGame((g) => ({ ...g, id: gameId }));
    },
    onError: (err) => {
      console.error("[game-studio] persisting the plan draft failed", err);
      setError(saveFailedMessage(err instanceof Error ? err.message : ""));
      reportSaveError(err);
    },
  });

  const clearHistory = (): void => {
    setIsClearOpen(false);
    setMessages([]);
    if (game.id) {
      void persistTranscript(editorPorts, game.id, null).catch(() => {
        /* best effort: the local thread is already cleared */
      });
    }
  };

  const stop = (): void => {
    abortRef.current?.abort();
    if (activeBuild) studioBuildStore.stop();
  };

  // ----- Version history -------------------------------------------------
  const versions = useStudioVersions({ game, setGame, isThinking, setError, saveFailedMessage });

  const openChanges = (): void => {
    setShowChanges(true);
    setView("code");
    setMtab("game");
  };

  // ----- Reference images ------------------------------------------------
  const addImages = async (): Promise<void> => {
    const scaled = await pickImages(ATTACHMENT_BOUND, MAX_ATTACHMENTS - pendingImages.length);
    if (scaled.length) setPendingImages((prev) => capImages(prev, scaled, MAX_ATTACHMENTS));
  };

  const stepLabel = useStepLabel("status");

  // ----- Plan step --------------------------------------------------------
  const planImage = planMode === "draw" ? sketchImage : photoImage;

  /** One brainstorming turn with the plan agent: prose and a plan proposal, never code. */
  async function sendPlanMessage(text: string, explicitImages?: string[]): Promise<void> {
    if (!text.trim() || isThinking) return;
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    setError(null);
    setDraft("");
    // Every plan turn is answered in the thread, which a surface would hide.
    setPlanSurface("chat");
    const fresh = explicitImages ?? (hasUnsentPlanImage && planImage ? [planImage] : []);
    const attachments = capImages([], [...fresh, ...pendingImages], MAX_ATTACHMENTS);
    setPendingImages([]);
    setHasUnsentPlanImage(false);

    const history = messages;
    const withUser: StudioChatMessage[] = [
      ...history,
      { role: "user", text, ...(attachments.length ? { images: attachments } : {}) },
    ];
    setMessages(withUser);
    setIsLocalBusy(true);
    setNarration("");

    const controller = new AbortController();
    abortRef.current = controller;
    // The reply keeps streaming while the parent uses other apps.
    const background = holdBackgroundWork("plan", {
      title: tBackground("planTitle"),
      subtitle: t("stepThinking"),
    });
    let isPlanAnswered = false;
    try {
      const outcome = await runPlanTurn(
        editorPorts,
        {
          text,
          attachments,
          history,
          currentPlan: planDraft || null,
          kids,
          primaryKidId,
          replyLocale: locale,
          gameId: () => gameIdRef.current,
          texts: {
            planProposedFallback: t("planProposedFallback"),
            planUpdatedNote: t("planUpdatedNote"),
            stopped: t("stopped"),
            planFailed: t("planFailed"),
          },
        },
        {
          signal: controller.signal,
          onActivity: (e) => {
            if (e.type === "narration_start") setNarration("");
            else if (e.type === "narration_delta") setNarration((n) => n + e.text);
          },
        },
      );
      if (outcome.kind === "no_provider") {
        setError(t("needProviderKey"));
        return;
      }
      if (outcome.kind === "stopped" || outcome.kind === "failed") {
        if (outcome.kind === "failed") setError(t("planFailed"));
        const reply = outcome.reply;
        setMessages((m) => [...m, reply]);
        return;
      }
      // On a phone the plan would cover the reply, so the pill waits.
      if (outcome.plan !== null) {
        setPlanDraft(outcome.plan);
        setIsEditingPlan(false);
      }
      if (outcome.reply) setMessages([...withUser, outcome.reply]);
      isPlanAnswered = true;
    } finally {
      background.release(isPlanAnswered);
      setIsLocalBusy(false);
      setNarration("");
      abortRef.current = null;
    }
  }

  /** Stage a plan image in the composer; opening the conversation also fills in its request. */
  const stagePlanImage = (image: string, promptKey: "planAnalyzePhotoPrompt" | "planAnalyzeSketchPrompt"): void => {
    setPendingImages((prev) => capImages(prev, [image], MAX_ATTACHMENTS));
    setHasUnsentPlanImage(false);
    if (messages.length === 0) setDraft((d) => (d.trim() ? d : t(promptKey)));
  };

  const onSketchChange = (dataUrl: string | null): void => {
    setSketchImage(dataUrl);
    setHasUnsentPlanImage(Boolean(dataUrl));
  };

  /** "Attach to chat" on the sketch surface: the surface closes to show the staged sketch. */
  const attachSketch = (): void => {
    if (!sketchImage) return;
    stagePlanImage(sketchImage, "planAnalyzeSketchPrompt");
    setPlanSurface("chat");
  };

  /** Accept the plan: derive the settings from the final text, then move on to settings. */
  async function acceptPlan(): Promise<void> {
    const text = planDraft.trim();
    if (!text || isDerivingSettings || isThinking) return;
    setIsDerivingSettings(true);
    setError(null);
    const background = holdBackgroundWork("plan", {
      title: tBackground("planTitle"),
      subtitle: t("stepThinking"),
    });
    let isDerived = false;
    try {
      const settings = await derivePlanSettingsForStudio(editorPorts, {
        planText: text,
        kids,
        primaryKidId,
        locale,
        defaultAgeMin: game.targetAgeMin,
        defaultAgeMax: game.targetAgeMax,
        gameId: () => gameIdRef.current,
      });
      if (settings) setGame((g) => applyPlanSettings(g, settings));
      isDerived = true;
    } catch (err) {
      console.error("[game-studio] deriving settings from the plan failed", err);
      setError(t("planSettingsFailed"));
    } finally {
      background.release(isDerived);
      setIsDerivingSettings(false);
      setAcceptedPlan(text);
      setIsEditingPlan(false);
      setPlanSurface("chat");
      setView("settings");
    }
  }

  const skipPlan = (): void => {
    setAcceptedPlan(null);
    setPlanSurface("chat");
    setView("settings");
  };

  const openSketchSurface = (): void => {
    setPlanMode("draw");
    setPlanSurface("sketch");
  };

  /** Photograph a worksheet: the camera opens, the photo is staged with its request. */
  const openPlanCamera = async (): Promise<void> => {
    setPlanMode("photo");
    const [photo] = await takePhoto(PLAN_PHOTO_BOUND);
    if (!photo) return;
    setPhotoImage(photo);
    stagePlanImage(photo, "planAnalyzePhotoPrompt");
  };

  /** The camera from the composer: the plan's photo while planning, an attachment otherwise. */
  const openCamera = async (): Promise<void> => {
    if (isPlanMode) {
      await openPlanCamera();
      return;
    }
    const scaled = await takePhoto(ATTACHMENT_BOUND);
    if (scaled.length) setPendingImages((prev) => capImages(prev, scaled, MAX_ATTACHMENTS));
  };

  const buildTexts = (): StudioBuildTexts => ({
    buildSummaryTitle: t("buildSummaryTitle"),
    stopped: t("stopped"),
    paused: t("buildPaused"),
    buildFailed: t("buildFailed"),
    previewUpdated: t("previewUpdatedMessage"),
    previewUpdateFailed: t("previewUpdateFailedMessage"),
  });

  const resetBuildNotices = (): void => {
    setError(null);
    setBgNotice(null);
    setPreviewNotice(null);
    setHasVisualCheckNotice(false);
  };

  async function send(raw?: string, opts?: { images?: string[]; isAgreedPlan?: boolean }): Promise<void> {
    const text = (raw ?? draft).trim();
    if (!text || isThinking) return;
    // Slash command: "/clear" wipes the conversation (with a confirm).
    if (raw === undefined && text === "/clear") {
      setDraft("");
      setIsClearOpen(true);
      return;
    }
    if (isPlanMode) {
      await sendPlanMessage(text);
      return;
    }
    // New-game hard gate: a draft must be saved (it gets its id) before dodi can build.
    if (isComposerLocked || !game.id) {
      setError(t("saveBeforeBuild"));
      setView("settings");
      return;
    }
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    if (!primaryKidId) {
      setInvalid((v) => ({ ...v, audience: true }));
      setView("settings");
      return;
    }
    // One build per device.
    if (isOtherBuildRunning) {
      setError(t("otherBuildRunning"));
      return;
    }
    resetBuildNotices();
    setDraft("");
    const attachments = opts?.images ?? pendingImages;
    setPendingImages([]);
    if (resumable) {
      setResumable(null);
      void studioBuildStore.discardResumable(game.id);
    }
    const history = messages;
    setMessages([...history, { role: "user", text, ...(attachments.length ? { images: attachments } : {}) }]);
    setIsStartingBuildRun(true);

    // Edits attach a screenshot of the game as it is. Best effort: text-only otherwise.
    let screenshot: string | undefined;
    if (game.built && sandboxRef.current) {
      const shot = await sandboxRef.current
        .requestSnapshot({ preferGameCapture: game.capabilities.includes("get_snapshot") })
        .catch(() => null);
      const scaled = shot ? await nativeImageOps.downscale(shot, SCREENSHOT_BOUND) : null;
      screenshot = scaled ?? undefined;
    }

    // The build runs in the studio build store: it outlives this screen.
    setIsStartingBuildRun(false);
    void studioBuildStore.start({
      gameId: game.id,
      game,
      text,
      images: attachments,
      isAgreedPlan: opts?.isAgreedPlan,
      screenshot,
      history,
      kids,
      primaryKidId,
      narrationLocale: locale,
      texts: buildTexts(),
    });
  }

  const resumeBuild = (): void => {
    if (!game.id || isThinking || isOtherBuildRunning) return;
    resetBuildNotices();
    setResumable(null);
    void studioBuildStore.resume(game.id, buildTexts());
  };

  const discardResumableBuild = (): void => {
    if (!game.id) return;
    setResumable(null);
    void studioBuildStore.discardResumable(game.id);
  };

  /** Take over a finished build: the thread, the game as built, the notices. */
  const applyBuildOutcome = (outcome: StudioBuildOutcome): void => {
    setMessages(outcome.transcript);
    if (outcome.kind === "no_provider") {
      setError(t("needProviderKey"));
      return;
    }
    if (outcome.kind === "stopped" || outcome.kind === "paused") return;
    if (outcome.kind === "failed") {
      setError(t("buildFailed"));
      return;
    }
    if (outcome.kind === "preview_only") {
      if (!outcome.previewImage) {
        setPreviewNotice("failed");
        return;
      }
      const preview = outcome.previewImage;
      setGame((g) => ({ ...g, previewImage: preview }));
      if (outcome.saveError !== undefined) setError(saveFailedMessage(outcome.saveError));
      return;
    }
    setBgNotice(outcome.backgroundNotice);
    setPreviewNotice(outcome.previewNotice);
    setHasVisualCheckNotice(outcome.hasVisualCheckNotice);
    setGame((g) => gameAfterBuild(g, outcome));
    if (outcome.isCodeChanged) versions.forgetRevert();
    setView("preview");
    if (!outcome.savedRow) {
      setError(saveFailedMessage(outcome.saveError ?? ""));
      return;
    }
    void versions.loadVersions();
    if (adoptedIdRef.current && game.id) {
      // Adopted in place on /game-studio/new: hand the route over to the game's own.
      adoptedIdRef.current = false;
      router.replace(studioHref(game.id, "preview"));
    }
  };

  // Adopt a finished build, when it ends here or on return from elsewhere in the app.
  useEffect(() => {
    if (!pendingOutcome || !game.id) return;
    const outcome = studioBuildStore.takeOutcome(game.id);
    // Adopting the build store's result is syncing from an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (outcome) applyBuildOutcome(outcome);
    // The outcome is the trigger; applyBuildOutcome reads the live render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOutcome, game.id]);

  // Offer to continue a build that the OS or a lost connection interrupted.
  const isBuildIdle = activeBuild === null;
  useEffect(() => {
    const gameId = game.id;
    if (!gameId || !isBuildIdle) return;
    let isCurrent = true;
    void studioBuildStore.findResumable(gameId).then((found) => {
      if (isCurrent) setResumable(found);
    });
    return () => {
      isCurrent = false;
    };
  }, [game.id, isBuildIdle]);

  async function saveSettings(): Promise<void> {
    if (isSaving) return;
    const nextInvalid = findInvalidSettings({
      title: game.title,
      learningGoal: game.learningGoal,
      targetAgeMin: game.targetAgeMin,
      targetAgeMax: game.targetAgeMax,
      primaryKidId,
      isPlanning,
    });
    const invalidFields = invalidSettingsList(nextInvalid);
    if (invalidFields) {
      reportSaveError(new Error(`invalid fields: ${invalidFields}`), "SaveBlockedByValidation");
      setInvalid(nextInvalid);
      setView("settings");
      return;
    }
    setInvalid({});
    setError(null);
    setIsSaving(true);
    const savePlan = planSettingsSave({ isPlanning, hasAcceptedPlan: acceptedPlan !== null });
    if (savePlan.isBuildStart) {
      // Hand off to the agent view before the first await.
      setIsStartingBuild(true);
      setIsLocalBusy(true);
      setNarration(t("savingSettings"));
      setView("preview");
      setMtab("chat");
    }
    const finishHandoff = (): void => {
      if (!savePlan.isBuildStart) return;
      setIsLocalBusy(false);
      setNarration("");
      setIsStartingBuild(false);
    };
    let saveStep = "await_planning_write";
    const watchdog = setTimeout(() => {
      reportSaveError(new Error(`settings save still pending after 20s at ${saveStep}`), "SaveStalled");
    }, SAVE_STALL_MS);
    try {
      // Let a planning write in flight land first, and never queue another.
      planningWriter().discard();
      await planningWriter().settled();
      const gameId = gameIdRef.current;
      if (gameId) {
        const mapped = savePlan.shouldMapSuccessDefinition
          ? await mapSettingsSuccessDefinition(editorPorts, game, (s) => {
              saveStep = s;
            })
          : null;
        if (mapped) setField("progressKind", mapped.progressKind);
        await patchGameSettings(editorPorts, gameId, game, {
          mapped,
          isEndingPlanning: isPlanning,
          onStep: (s) => {
            saveStep = s;
          },
        });
        saveStep = "save_listing_translations";
        await listingTranslations.save();

        if (isPlanning) {
          planningWriter().discard();
          setIsPlanning(false);
          if (acceptedPlan) {
            // This save IS the start of the build (the effect below starts it).
            pendingAutoBuildRef.current = {
              text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
              images: planImage ? [planImage] : [],
            };
            finishHandoff();
            return;
          }
          if (adoptedIdRef.current) {
            // Created by the first plan turn while the route is still /new.
            adoptedIdRef.current = false;
            router.replace(studioHref(gameId, "preview"));
            return;
          }
        }
      } else {
        // A new game straight from settings: the Plan conversation rides along (sealed).
        saveStep = "create_game";
        const newGameId = await createGameFromSettings(editorPorts, {
          kidId: primaryKidId,
          game,
          transcript: messages,
        });
        setIsPlanning(false);
        if (acceptedPlan) {
          // Adopt the new id in place: routing would remount the studio mid-handoff.
          pendingAutoBuildRef.current = {
            text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
            images: planImage ? [planImage] : [],
          };
          adoptedIdRef.current = true;
          gameIdRef.current = newGameId;
          setGame((g) => ({ ...g, id: newGameId }));
          finishHandoff();
          return;
        }
        // The draft's own route: the build binds to its id and the chat unlocks there.
        router.replace(studioHref(newGameId));
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      console.error("[game-studio] settings save failed at", saveStep, e);
      reportSaveError(e);
      setError(saveFailedMessage(e instanceof Error && e.message ? e.message : ""));
      if (savePlan.isBuildStart) {
        pendingAutoBuildRef.current = null;
        finishHandoff();
        setView("settings");
        setMtab("game");
      }
    } finally {
      clearTimeout(watchdog);
      setIsStartingBuild(false);
      setIsSaving(false);
    }
  }

  // Start the build queued by an accepted plan once the id is live and the chat unlocked.
  useEffect(() => {
    const pending = pendingAutoBuildRef.current;
    if (!pending || !game.id || isPlanning) return;
    pendingAutoBuildRef.current = null;
    void send(pending.text, { images: pending.images, isAgreedPlan: true });
    // Fires exactly once per save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, isPlanning]);

  /** The header's auto-saving active switch: optimistic, reverted on failure. */
  async function toggleActive(): Promise<void> {
    if (!game.id || isTogglingActive) return;
    const next = !game.isActive;
    const gameId = game.id;
    setField("isActive", next);
    setIsTogglingActive(true);
    setError(null);
    try {
      await setGameActive(editorPorts, gameId, next);
    } catch (e) {
      setField("isActive", !next);
      setError(saveFailedMessage(e instanceof Error && e.message ? e.message : ""));
    } finally {
      setIsTogglingActive(false);
    }
  }

  const statusText = isPlanMode
    ? isThinking
      ? t("planThinking")
      : t("plannerRole")
    : isThinking
      ? step
        ? stepLabel(step)
        : t("working")
      : t("designerRole");

  // The turn links attach only to the last code-changing reply.
  const lastChangeIndex = messages.reduce((last, m, i) => (m.hasCodeChange ? i : last), -1);

  const composerPlaceholder = needsGameProvider
    ? t("composerPlaceholderNoThinking")
    : isPlanMode
      ? t("planComposerPlaceholder")
      : messages.length === 0
        ? t("composerPlaceholderEmpty")
        : t("composerPlaceholder");

  return {
    isEditing,
    game,
    kids,
    view,
    setView,
    mtab,
    setMtab,
    panes,
    isPlanning,
    isPlanMode,
    isMobilePlan,
    isMobileSurfaceOpen,
    planSurface,
    setPlanSurface,
    // Thread and composer
    messages,
    draft,
    setDraft,
    pendingImages,
    removePendingImage: (index: number) => setPendingImages((prev) => prev.filter((_, j) => j !== index)),
    isThinking,
    activeBuild,
    step,
    narration,
    writeChars,
    liveRun,
    statusText,
    composerPlaceholder,
    isComposerLocked: isComposerLockedNow,
    needsGameProvider,
    resumable,
    isOtherBuildRunning,
    error,
    bgNotice,
    previewNotice,
    hasVisualCheckNotice,
    send: () => void send(),
    sendStarter: (text: string) => void send(text),
    stop,
    resumeBuild,
    discardResumableBuild,
    isAttachSheetOpen,
    setIsAttachSheetOpen,
    openCamera: () => void openCamera(),
    addImages: () => void addImages(),
    isClearOpen,
    setIsClearOpen,
    clearHistory,
    lastChangeIndex,
    openChanges,
    // Plan step
    hasPlan,
    planDraft,
    setPlanDraft,
    isEditingPlan,
    toggleEditPlan: () => setIsEditingPlan((v) => !v),
    acceptPlan: () => void acceptPlan(),
    skipPlan,
    personalizePlan: () => void sendPlanMessage(t("planChipPersonalize")),
    isDerivingSettings,
    acceptedPlan,
    sketchStrokes,
    setSketchStrokes,
    onSketchChange,
    attachSketch,
    openSketchSurface,
    openPlanCamera: () => void openPlanCamera(),
    sendPlanIdea: () => void send(t("planStarterIdea")),
    // Stage
    sandboxRef,
    previewLocale,
    setPreviewLocaleChoice,
    previewHasTranslations,
    toggleActive: () => void toggleActive(),
    isTogglingActive,
    showChanges,
    setShowChanges,
    versions,
    // Settings
    invalid,
    setField,
    selectFamily,
    toggleKid,
    saveSettings: () => void saveSettings(),
    isSaving,
    justSaved,
    hasImageProvider,
    listingTranslations,
    listingSourceLocale,
  };
}

export type GameStudioController = ReturnType<typeof useGameStudio>;
