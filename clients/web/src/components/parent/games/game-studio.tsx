"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { GameStage } from "@/components/games/game-stage";
import type { GameSandboxHandle } from "@/components/games/game-sandbox";
import { RequiredMark } from "@/components/parent/rows";
import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STAGE } from "@/lib/games/stage";
import { extractTranslations, hasTranslationsBlock } from "@dodi/games/translations";
import { normalizeLocale } from "@dodi/intl/locales";
import { locales } from "@/i18n/config";
import { CodeViewer } from "@/components/parent/games/code-viewer";
import { AgeRange } from "@/components/parent/games/age-range";
import { ListingTranslationsField } from "@/components/parent/games/listing-translations-field";
import { TagPicker } from "@/components/parent/games/tag-picker";
import { PlanActionRow, PlanEmptyActions } from "@/components/parent/games/plan-chat-actions";
import { PlanSketchSurface } from "@/components/parent/games/plan-sketch-surface";
import { PlanSurface } from "@/components/parent/games/plan-surface";
import { ReferenceImageSheet } from "@/components/parent/games/reference-image-sheet";
import { RichText } from "@/components/parent/games/rich-text";
import { AgentRunHistory } from "@/components/parent/games/agent-run-history";
import { isComposerSendKey } from "@/components/parent/games/composer-keys";
import { AgentRunTimeline } from "@/components/parent/games/agent-run-timeline";
import type { ResumableBuild } from "@dodi/studio/build-manager";
import {
  SCREENSHOT_BOUND,
  type StudioBuildOutcome,
  type StudioBuildTexts,
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
  invalidSettingsList,
  planSettingsSave,
  resolveDraftGate,
} from "@dodi/studio/settings-save";
import type { SketchStroke } from "@dodi/studio/sketch-strokes";
import {
  checkStudioProviders,
  persistTranscript as persistTranscriptCore,
  setGameActive,
} from "@dodi/studio/studio-editor";
import {
  emptyStudioGame,
  resolvePrimaryKidId,
  type StudioGame,
  type StudioView,
} from "@dodi/studio/studio-game";
import { gameAfterBuild } from "@dodi/studio/studio-outcome";
import {
  resolveStudioPanes,
  type PlanSurface as PlanSurfaceKind,
} from "@dodi/studio/studio-panes";
import {
  applyPlanSettings,
  createPlanningWriter,
  derivePlanSettingsForStudio,
  persistPlanning,
  type PlanningWriter,
  runPlanTurn,
} from "@dodi/studio/studio-plan";
import {
  createGameFromSettings,
  mapSettingsSuccessDefinition,
  patchGameSettings,
} from "@dodi/studio/studio-settings";
import {
  type GameVersionEntry,
  listGameVersions,
  loadVersionCode,
  restoreGameVersion,
  saveCodeEdit,
} from "@dodi/studio/studio-versions";
import { restoreTranscript, type StudioChatMessage } from "@dodi/studio/transcript";
import { cn } from "@/lib/utils";
import {
  activeToggle,
  audiencePill,
  chatHeader,
  chatMessage,
  chatThinking,
  chatThread,
  chatWelcome,
  composer,
  composerNotice,
  emptyStage,
  optionChip,
  previewLocale as previewLocaleStyle,
  stageBody,
  stageHeader,
  studioActionRow,
  studioFrame,
  studioSeg,
  studioSettings,
  studioTab,
  studioTabBar,
  studioTextarea,
} from "@dodi/ui-recipes";
import { capImages, downscaleDataUrl, fileToDataUrl } from "@/lib/games/thumbnail";
import { useKids } from "@/hooks/use-kids";
import { type ListingTranslations, useListingTranslations } from "@/hooks/use-listing-translations";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { studioBuildStore, useStudioBuild } from "@/stores/studio-build-store";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";
import { webStudioEditorPorts } from "@/lib/games/studio-ports";
import {
  browserFailureMeta,
  describeError,
  reportErrorLog,
  startFailureTimer,
} from "@/lib/errors/report-error-log";
import type { AgentStep } from "@dodi/types/agent-progress";
import type { GamePerspective } from "@dodi/types/games";

interface KidOption {
  id: string;
  name: string;
  /** Decrypted personal fields, used to assemble agent context client-side. */
  birthdate: string | null;
  memory: string | null;
  parent_notes: string | null;
  /** Operational (non-encrypted) locale, used for the agent's output language. */
  language: string;
}

// What the stage can show is `DraftView` (@dodi/studio/plan-state): the three
// tabs, plus "plan" while the game is still being planned. "plan" is
// deliberately NOT a StudioView: it has no tab URL — `/game-studio/{id}/plan`
// falls back to the default tab like any other unknown segment, and the studio
// reopens on the Plan step from the persisted envelope instead.

interface GameStudioProps {
  initialGame?: StudioGame;
  /** Tab from the route; falls back to preview for a saved game, settings for a draft. */
  initialView?: StudioView;
}

type ChatMessage = StudioChatMessage;

const SIDE_MIN = 300;
const SIDE_MAX = 620;
const SIDE_DEFAULT = 384;
const COMPOSER_MIN = 60;
const COMPOSER_MAX = 520;
const COMPOSER_DEFAULT = 150;
/** One line of the composer (14.5px text at leading-normal, plus its padding).
 *  The sketch surface shrinks the input to this so the canvas gets the screen. */
const COMPOSER_ONE_LINE = 28;
/** How far the composer may grow back on a plan surface, once there is text to
 *  read. Well under the resizable height, which the canvas and the plan need
 *  more than the input does. */
const COMPOSER_SURFACE_MAX = 96;
/** Max reference images a single message can carry. */
const MAX_ATTACHMENTS = 3;
/** How long the Plan step waits after a change before re-sealing it onto the row. */
const PLANNING_PERSIST_DELAY_MS = 800;

/** The studio editor's platform ports (API, vault, caches, AI resolution). */
const editorPorts = webStudioEditorPorts;

/**
 * The studio URL for a game and a stage view. The Plan step has no tab
 * segment (see DraftView), so it maps to the bare game URL.
 */
function studioUrl(gameId: string, view: DraftView): string {
  return view === "plan"
    ? `/parent/game-studio/${gameId}`
    : `/parent/game-studio/${gameId}/${view}`;
}

/** Read a persisted panel size from localStorage, clamped to [min, max]. */
function readStoredSize(key: string, min: number, max: number, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseInt(window.localStorage.getItem(key) ?? "", 10);
  return v >= min && v <= max ? v : fallback;
}

/** Unseal a persisted conversation transcript for the initial thread (resume). */
function restoreInitialTranscript(initialGame?: StudioGame): ChatMessage[] {
  return restoreTranscript(useVaultStore.getState().session, initialGame?.agentTranscriptEnc);
}

/** The composer's warning and info lines. */
const warningNotice = cn(
  composerNotice.web,
  composerNotice.box,
  composerNotice.text,
  composerNotice.warning,
  composerNotice.warningText,
);
const primaryNotice = cn(
  composerNotice.web,
  composerNotice.box,
  composerNotice.text,
  composerNotice.primary,
  composerNotice.primaryText,
);

export function GameStudio({ initialGame, initialView }: GameStudioProps) {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const router = useRouter();
  const editing = Boolean(initialGame?.id);

  // Kid names are vault-encrypted at rest; decrypt them client-side.
  const { kids: kidRows } = useKids();
  const kids: KidOption[] = (kidRows ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    birthdate: p.birthdate,
    memory: p.memory,
    parent_notes: p.parent_notes,
    language: p.language,
  }));

  const [game, setGame] = useState<StudioGame>(initialGame ?? emptyStudioGame());
  // The game id as of right now. `game.id` is null for a draft and is adopted
  // in place when a planned draft is saved, so callbacks that must not go stale
  // across that transition (setView's URL mirroring) read it from here.
  const gameIdRef = useRef<string | null>(initialGame?.id ?? null);

  // Surface the live game title in the shared breadcrumb bar (the studio has no
  // top bar of its own); clear it when leaving the studio.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(game.title.trim() || t("addGame"));
    return () => setLeaf(null);
  }, [game.title, setLeaf, t]);

  // The persisted Plan step, unsealed once on mount (plan-state.ts). Null for
  // a brand-new game (nothing persisted yet) and for a game past planning.
  const [restoredPlanning] = useState<PlanningState | null>(() =>
    restorePlanning(initialGame?.planEnc, useVaultStore.getState().session),
  );
  // A planning draft reopens where the parent left off (the Plan step, or the
  // settings once the plan was accepted); an existing game on its preview.
  const [view, setViewState] = useState<DraftView>(() =>
    resolveInitialView({
      initialView,
      hasId: Boolean(initialGame?.id),
      planning: restoredPlanning,
    }),
  );

  // Discover listing translations, editable in settings (where a review's
  // translation findings get fixed). Loaded the first time settings opens.
  const listingTranslations = useListingTranslations(game.id, view === "settings");
  const listingSourceLocale = useMemo(() => {
    if (view !== "settings" || !game.codeBundle) return null;
    const source = extractTranslations(game.codeBundle).translations?.sourceLocale;
    return source ? normalizeLocale(source) : null;
  }, [view, game.codeBundle]);

  /**
   * Switch tab and mirror it into the URL so the tab is linkable and survives a
   * reload. Deliberately `history.replaceState` rather than a router navigation:
   * re-rendering this route would remount the studio and take the live chat
   * thread, a running agent build and the mounted sandbox with it. Replacing
   * (not pushing) also keeps Back meaning "leave the studio" rather than
   * unwinding a trail of tab switches. A brand-new game has no id and so no
   * URL yet.
   *
   * Keyed on the LIVE id, not `initialGame`: the first plan turn (and the
   * settings save of an unplanned draft) adopt the new id in place instead of
   * remounting the studio.
   */
  const setView = (next: DraftView): void => {
    setViewState(next);
    const gameId = gameIdRef.current;
    if (gameId && typeof window !== "undefined") {
      window.history.replaceState(null, "", studioUrl(gameId, next));
    }
  };

  // Canonicalize on entry: `/game-studio/{id}` (and anything unrecognized in the
  // tab slot) becomes the tab actually being shown, so a reload or a shared link
  // lands where the parent left off.
  useEffect(() => {
    const gameId = initialGame?.id;
    if (!gameId) return;
    const canonical = studioUrl(gameId, view);
    if (window.location.pathname !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
    // Entry only — later tab switches keep the URL in step via setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGame?.id]);
  // Initial thread = the unsealed prior conversation (resume), or empty. The
  // Plan step shares it: the brainstorming turns become the head of the build
  // conversation, so the coding agent inherits everything that was discussed.
  const [localMessages, setMessages] = useState<ChatMessage[]>(() =>
    restoreInitialTranscript(initialGame),
  );
  const [draft, setDraft] = useState("");
  // Reference images staged for the next message (downscaled data URLs).
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // File drag-over on the agent inbox: depth counter ignores enter/leave of
  // child nodes so the drop overlay doesn't flicker.
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  // Work this screen runs itself: a plan turn, or the save that starts a
  // build. Builds run in the studio build store instead (see below), so they
  // outlive this component.
  const [isLocalBusy, setThinking] = useState(false);
  // Keep the screen awake while a plan turn runs (builds: BuildActivityHost).
  useWakeLock(isLocalBusy);
  // Live "working aloud" text of a plan turn (builds stream theirs into the store).
  const [localNarration, setNarration] = useState("");

  // This game's build, if one is running on this device. The store owns it;
  // this screen only shows it, and adopts its outcome when it ends.
  const activeBuild = useStudioBuild((s) =>
    s.active && s.active.gameId === game.id ? s.active : null,
  );
  const pendingOutcome = useStudioBuild((s) => (game.id ? s.outcomes[game.id] : undefined));
  // Another game's build holds the device's single build slot.
  const isOtherBuildRunning = useStudioBuild(
    (s) => s.active !== null && s.active.gameId !== game.id,
  );
  // A build is being handed to the store (the edit screenshot is captured
  // first); counts as busy, but is not a plan turn the navigation guard needs.
  const [isStartingBuildRun, setIsStartingBuildRun] = useState(false);
  const thinking = isLocalBusy || isStartingBuildRun || activeBuild !== null;
  const step: AgentStep | null = activeBuild?.step ?? null;
  // Live "working aloud" text streamed from the model — shown under the
  // thinking indicator. Ephemeral: reset per text block, never persisted.
  const narration = activeBuild ? activeBuild.narration : localNarration;
  // Cumulative streamed size of the current write, in 200-char steps. 0 = hidden.
  const writeChars = activeBuild?.writeChars ?? 0;
  // The running build's timeline (run log), shown live in the thinking block.
  const liveRun = activeBuild?.runLog ?? null;
  // The thread: the running build's (it carries the in-flight message), then
  // a finished build's until this screen adopts it, else the screen's own.
  const messages =
    activeBuild?.transcript ?? pendingOutcome?.transcript ?? localMessages;
  // An interrupted build of this game that can continue from its checkpoint.
  const [resumable, setResumable] = useState<ResumableBuild | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Background generation was enabled but the build produced no image — tells
  // the parent whether the model skipped the tool or generation failed.
  const [bgNotice, setBgNotice] = useState<"skipped" | "failed" | null>(null);
  // Same signal for the game-list preview image: the setting was on, the game
  // had no preview yet, and the build still ended without one.
  const [previewNotice, setPreviewNotice] = useState<"skipped" | "failed" | null>(null);
  // A screenshot service was on but never delivered frames this build. A
  // platform without a configured worker is a silent skip, so self-hosters
  // are not nagged; real failures do get the notice.
  const [visualCheckNotice, setVisualCheckNotice] = useState(false);
  // The account setting that picks the screenshot service (single-flight
  // shared cache; already loaded by the parent shell in the common case). The
  // build reads it from the store when it starts.
  const loadAccount = useAccountStore((s) => s.load);
  // Mandatory settings fields left empty on save — drives the red field markers.
  const [invalid, setInvalid] = useState<{
    title?: boolean;
    learningGoal?: boolean;
    audience?: boolean;
    age?: boolean;
  }>({});
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // A build-starting settings save is in flight: the studio already shows the
  // agent view (see saveSettings) while the save lands.
  const [isStartingBuild, setIsStartingBuild] = useState(false);

  // ----- Plan step -------------------------------------------------------
  // Still on the Plan step: a brand-new game, or a persisted planning draft
  // (games.plan_enc set) reopened where the parent left off. Saving the
  // settings is what ends planning.
  const [isPlanning, setIsPlanning] = useState(
    () => !initialGame?.id || restoredPlanning !== null,
  );
  const planning0 = restoredPlanning ?? EMPTY_PLANNING;
  // Which inspiration surface is open, and the image each one holds. Both are
  // kept so switching back and forth never throws work away; the one from the
  // open surface is what dodi sees.
  const [planMode, setPlanMode] = useState<"draw" | "photo">(planning0.mode);
  const [sketchImage, setSketchImage] = useState<string | null>(planning0.sketchImage);
  const [photoImage, setPhotoImage] = useState<string | null>(planning0.photoImage);
  // The sketch itself lives here, not in the pad: on a phone the pad is mounted
  // only while its surface is open, and a rotation swaps one pad for another.
  const [sketchStrokes, setSketchStrokes] = useState<SketchStroke[]>(planning0.sketchStrokes);
  // The summary on the table: dodi's proposal, or the parent's edit of it.
  const [planDraft, setPlanDraft] = useState(planning0.summary);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  // The approved text. Non-null ⇒ saving the draft starts the build with it.
  const [acceptedPlan, setAcceptedPlan] = useState<string | null>(
    planning0.isAccepted ? planning0.summary : null,
  );
  const [isDerivingSettings, setIsDerivingSettings] = useState(false);
  // A sketch/photo the parent has not shown dodi yet — it rides the next message.
  const [hasUnsentPlanImage, setHasUnsentPlanImage] = useState(false);
  // The build to start once the settings are saved (see saveSettings).
  const pendingAutoBuildRef = useRef<{ text: string; images: string[] } | null>(null);
  // This studio adopted its id in place (the first plan turn, or the settings
  // save of an unplanned draft) rather than being remounted by the router —
  // the successful save/build hands the route over instead of refreshing.
  const adoptedIdRef = useRef(false);
  // In-flight state for the header's active/inactive auto-save toggle.
  const [togglingActive, setTogglingActive] = useState(false);
  // Whether an explicit thinking model is configured (model_config.thinkingProvider).
  // Game build/edit needs it — the voice model alone can't drive the agent.
  // null = still loading, so we don't flash the warning before we know.
  const [hasGameProvider, setHasGameProvider] = useState<boolean | null>(null);
  // Whether an image model is configured AND its vault key is available — gates
  // the "generate background image" setting. null = still loading.
  const [hasImageProvider, setHasImageProvider] = useState<boolean | null>(null);
  // Code-tab diff mode — also flipped on by the per-turn "Show changes" link.
  const [showChanges, setShowChanges] = useState(false);
  // In-flight state for Revert, and whether the last change is currently
  // reverted (flips the link label to "Restore"; session-local only).
  const [reverting, setReverting] = useState(false);
  const [reverted, setReverted] = useState(false);
  // Version history (lean entries, newest first) + per-version code cache
  // (id → code), filled lazily for diff bases.
  const [versions, setVersions] = useState<GameVersionEntry[]>([]);
  const [versionCodes, setVersionCodes] = useState<Record<string, string>>({});
  // The version left behind by the last Revert, so Restore can go forward again.
  const redoVersionRef = useRef<string | null>(null);
  // Manual code-edit save dialog ("create a new version" defaults to on).
  const [saveEditOpen, setSaveEditOpen] = useState(false);
  const [saveAsNewVersion, setSaveAsNewVersion] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const pendingEditRef = useRef<{ code: string; resolve: (saved: boolean) => void } | null>(null);
  // Destructive "clear history" confirmation dialog.
  const [clearOpen, setClearOpen] = useState(false);
  const [sideWidth, setSideWidth] = useState(() =>
    readStoredSize("dodi-studio-side-width", SIDE_MIN, SIDE_MAX, SIDE_DEFAULT),
  );
  const [composerHeight, setComposerHeight] = useState(() =>
    readStoredSize("dodi-studio-input-height", COMPOSER_MIN, COMPOSER_MAX, COMPOSER_DEFAULT),
  );
  // Portrait phones + upright tablets get a vertical, tab-switched layout
  // (matches the `compact` CSS variant). Landscape/desktop keep the resizable
  // side-by-side panes.
  const vertical = useMediaQuery("(orientation: portrait), (max-width: 767px)");
  // Touch keyboards: Enter types a newline in the composer; sending is the button.
  const isTouch = useMediaQuery("(pointer: coarse)");
  // New games open on the Game tab (the Plan step, then settings); existing
  // games open on the Dodi chat.
  const [mtab, setMtab] = useState<"game" | "chat">(
    initialGame?.id ? "chat" : "game",
  );
  // What the Plan step shows besides the conversation. On a phone the surface
  // takes the thread's place; side by side it takes the stage next to the chat.
  const [planSurface, setPlanSurface] = useState<PlanSurfaceKind>("chat");
  // "Take a photo" opens the camera straight from the chat pane. While planning
  // the photo sends itself for reading; otherwise it is staged like an upload.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // The composer's image button offers the ways in: camera, file, sketch. The
  // sheet opens over the composer block, so it needs the block's footprint.
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Handle into the always-mounted preview sandbox (edit-time screenshots).
  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const sideWidthRef = useRef(sideWidth);
  const composerHeightRef = useRef(composerHeight);
  // The in-flight build's abort handle — drives Stop + navigation guards.
  const abortRef = useRef<AbortController | null>(null);

  // The Plan step is the one place a planning draft may talk to dodi: it
  // brainstorms the idea, it does not build anything.
  const isPlanMode = isPlanning && view === "plan";
  // Building is locked until the settings are saved (new-game hard gate): that
  // is what ends planning, and for an unplanned draft it also mints the id.
  // A save that starts a planned build opens the chat early (the handoff), but
  // the composer stays locked until the save has landed.
  const { isPaneLocked, isComposerLocked } = resolveDraftGate({
    isPlanning,
    isPlanMode,
    isStartingBuild,
  });
  const hasPlan = planDraft.trim().length > 0;
  // On a phone the Plan step IS the chat pane: no Game/dodi switch, and the
  // sketch and the plan open over the thread instead of on the other tab. A
  // surface there carries its own header and needs the height for its content,
  // so the pane's chrome steps aside: no dodi header, no footer line, and the
  // composer drops to a single line until there is something typed in it.
  const isMobilePlan = vertical && isPlanMode;
  const mobileSurfaceOpen = isMobilePlan && planSurface !== "chat";
  const panes = resolveStudioPanes({
    vertical,
    locked: isPaneLocked,
    isPlanMode,
    mtab,
    planSurface,
  });
  // Side by side, the Plan step's chat spans the studio until a surface takes
  // the stage; then the chat is the sidebar again.
  const chatFullscreen = !vertical && panes.showChat && !panes.showMain;

  // Pin the thread to the latest turn on resume, after each turn, and when the
  // chat pane becomes visible (mobile tab switch / draft unlock / a plan
  // surface closing). Measuring while hidden yields scrollHeight 0, so skip
  // until the thread is actually on screen.
  useEffect(() => {
    if (!panes.showChat || mobileSurfaceOpen) return;
    const el = threadRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, thinking, narration, writeChars, liveRun, panes.showChat, mobileSurfaceOpen]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  // Building/editing a game is a complex task that requires an explicitly
  // configured Game generation model. Without one we lock the composer (just
  // like the unsaved-draft gate) and surface a subtle warning above the input.
  const needsGameProvider = hasGameProvider === false;
  const composerLocked = isComposerLocked || needsGameProvider;

  // Resolve whether a Game generation model is configured. Drives the composer
  // lock + warning so we never fall back to the voice/thinking model for a
  // build (the game agent needs an Anthropic tool-use model).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const check = await checkStudioProviders(editorPorts(), (hasGame) => {
        if (!cancelled) setHasGameProvider(hasGame);
      });
      if (cancelled) return;
      setHasGameProvider(check.hasGameProvider);
      setHasImageProvider(check.hasImageProvider);
      // New games default both image generations on — an illustrated
      // background and a list preview are what a game is expected to look
      // like. Only once an image provider is confirmed, though, so accounts
      // without an image model never save a flag (or a checked-but-disabled
      // switch) they can't use. Existing games keep their own settings.
      if (check.hasImageProvider && !editing) {
        setGame((g) =>
          g.id ? g : { ...g, generatePreviewImage: true, generateBackgroundImage: true },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // `editing` is fixed for a mounted studio (derived from initialGame), so
    // this still runs exactly once per mount.
  }, [editing]);

  const startSideResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidthRef.current;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent): void => {
      const next = Math.min(SIDE_MAX, Math.max(SIDE_MIN, startW + (startX - ev.clientX)));
      sideWidthRef.current = next;
      setSideWidth(next);
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("dodi-studio-side-width", String(sideWidthRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const startComposerResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = composerHeightRef.current;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent): void => {
      const next = Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, startH + (startY - ev.clientY)));
      composerHeightRef.current = next;
      setComposerHeight(next);
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("dodi-studio-input-height", String(composerHeightRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const setField = <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => {
    setGame((g) => ({ ...g, [key]: value }));
    // Editing a previously-flagged mandatory field clears its red state.
    if (key === "title" || key === "learningGoal") {
      setInvalid((v) => ({ ...v, [key]: false }));
    }
    if (key === "targetAgeMin" || key === "targetAgeMax") {
      setInvalid((v) => ({ ...v, age: false }));
    }
  };

  // ── "Who can play" selection ───────────────────────────────────────────
  const primaryKidId = resolvePrimaryKidId(game, kids);
  // ── Preview locale ─────────────────────────────────────────────────────
  // Defaults to the kid's game language (= the source locale of new builds);
  // the picker lets the parent test each platform language. Only games with a
  // translations block react to it, so the picker hides otherwise.
  const [previewLocaleChoice, setPreviewLocaleChoice] = useState<string | null>(null);
  const previewLocale =
    previewLocaleChoice ??
    normalizeLocale(kids.find((k) => k.id === primaryKidId)?.language ?? locale);
  const previewHasTranslations = game.codeBundle
    ? hasTranslationsBlock(game.codeBundle)
    : false;
  const selectedKids = game.isFamily
    ? kids
    : kids.filter((k) => game.audienceIds.includes(k.id));
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

  // Resume: the initial thread is unsealed from the persisted transcript in the
  // useState initializer above (restoreInitialTranscript), so re-entry picks up where
  // the parent left off — a locked vault or wrong key just yields an empty thread.

  // Persist the (sealed) conversation alongside the game. `null` clears it.
  const persistTranscript = async (transcript: ChatMessage[] | null): Promise<void> => {
    if (!game.id) return;
    await persistTranscriptCore(editorPorts(), game.id, transcript);
  };

  // ----- Plan step persistence -------------------------------------------
  // Once the parent has talked to the plan agent the draft is worth keeping:
  // the first turn creates the game row (adopting its id in place, like a
  // planned save does) and every later change to the thread, the plan or the
  // sketch/photo re-seals the Plan-step envelope onto it (games.plan_enc). So
  // the parent can leave mid-planning and pick up where they left off.
  //
  // Writes read the latest state through refs (they run from timers, after
  // the render that changed something), are debounced so a burst of strokes
  // costs one upload, and run one at a time so the create always lands before
  // the first patch.
  const planningRef = useRef<PlanningState>(EMPTY_PLANNING);
  const messagesRef = useRef(messages);
  const gameRef = useRef(game);
  useEffect(() => {
    planningRef.current = {
      summary: planDraft,
      isAccepted: acceptedPlan !== null,
      mode: planMode,
      sketchImage,
      photoImage,
      sketchStrokes,
    };
    messagesRef.current = messages;
    gameRef.current = game;
  });
  // The write loop (@dodi/studio/studio-plan): one write at a time, again if
  // anything changed meanwhile. A settings save waits for it — a planning
  // write landing after the save would resurrect the envelope it just cleared.

  const persistPlanningNow = async (): Promise<void> => {
    const current = gameRef.current;
    const result = await persistPlanning(editorPorts(), {
      gameId: gameIdRef.current,
      game: current,
      kidId: resolvePrimaryKidId(current, kids),
      planning: planningRef.current,
      transcript: messagesRef.current,
    });
    if (result.kind !== "created") return;
    // Adopt the id in place: a navigation would remount the studio and take
    // the live thread, the sketch and a running plan turn with it. The URL is
    // corrected here; the route is handed over once the settings are saved.
    adoptedIdRef.current = true;
    gameIdRef.current = result.gameId;
    setGame((g) => ({ ...g, id: result.gameId }));
    window.history.replaceState(null, "", studioUrl(result.gameId, "plan"));
  };

  // A failed write is reported once and the state stays in the browser — the
  // next change tries again.
  const onPlanningWriteError = (err: unknown): void => {
    console.error("[game-studio] persisting the plan draft failed", err);
    const reason = err instanceof Error ? err.message : "";
    setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
    reportErrorLog({
      context: "game_save",
      kidId: primaryKidId,
      gameId: gameIdRef.current,
      ...describeError(err, []),
    });
  };
  // The writer lives as long as the screen; it calls through refs so every
  // write reads the latest render.
  const persistPlanningRef = useRef(persistPlanningNow);
  const onPlanningWriteErrorRef = useRef(onPlanningWriteError);
  useEffect(() => {
    persistPlanningRef.current = persistPlanningNow;
    onPlanningWriteErrorRef.current = onPlanningWriteError;
  });
  const planningWriterRef = useRef<PlanningWriter | null>(null);
  // Effects and handlers only (never during render): created on first use.
  const planningWriter = (): PlanningWriter => {
    planningWriterRef.current ??= createPlanningWriter(
      () => persistPlanningRef.current(),
      (err) => onPlanningWriteErrorRef.current(err),
    );
    return planningWriterRef.current;
  };

  // Mark the Plan step dirty on every change once there has been an
  // interaction (a message in the thread), and write it out after a pause.
  // Past planning the envelope is gone (cleared by the settings save) and
  // nothing here runs again.
  useEffect(() => {
    if (!isPlanning || messages.length === 0) return;
    planningWriter().markDirty();
    const timer = setTimeout(() => void planningWriter().flush(), PLANNING_PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isPlanning, messages, planDraft, acceptedPlan, planMode, sketchImage, photoImage, sketchStrokes]);

  // Leaving the studio (a client-side navigation) flushes a pending write —
  // the request outlives the component, the state lives on the server.
  useEffect(
    () => () => {
      if (planningWriter().isDirty()) void planningWriter().flush();
    },
    [],
  );

  // Export and publish live in the game list's actions menu, not here — both act
  // on the persisted row, so they don't need the studio's live state.

  // Clear the conversation — the local thread and the persisted (sealed) copy.
  const clearHistory = (): void => {
    setClearOpen(false);
    setMessages([]);
    void persistTranscript(null).catch(() => {
      /* best effort — the local thread is already cleared */
    });
  };

  // Stop the running plan turn or build; each resets the UI as it ends.
  const stop = (): void => {
    abortRef.current?.abort();
    if (activeBuild) studioBuildStore.stop();
  };

  // ----- Version history -------------------------------------------------

  // Refresh the lean version list (after builds / manual saves).
  const loadVersions = useCallback(async (): Promise<void> => {
    if (!game.id) return;
    // Null = unavailable: history is non-critical chrome, the studio works without it.
    const list = await listGameVersions(editorPorts(), game.id);
    if (list) setVersions(list);
  }, [game.id]);

  useEffect(() => {
    void (async () => {
      await loadVersions();
    })();
  }, [loadVersions]);

  const currentVersion = versions.find((v) => v.id === game.currentGameVersionId) ?? null;
  const previousVersionId = currentVersion?.previous_game_version_id ?? null;

  // Lazily fetch the diff base (previous version's code) into the cache map;
  // `previousCode` is then a pure derivation (no sync setState in the effect).
  useEffect(() => {
    const gameId = game.id;
    if (!gameId || !previousVersionId) return;
    if (versionCodes[previousVersionId] !== undefined) return;
    let cancelled = false;
    void (async () => {
      // Null = the diff stays unavailable (non-critical chrome).
      const code = await loadVersionCode(editorPorts(), gameId, previousVersionId);
      if (code !== null && !cancelled) {
        setVersionCodes((m) => ({ ...m, [previousVersionId]: code }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, previousVersionId, versionCodes]);

  const previousCode = previousVersionId ? (versionCodes[previousVersionId] ?? null) : null;

  // A previous version exists and differs — enables Show changes / Revert.
  const canDiff = Boolean(previousCode) && previousCode !== game.codeBundle;

  // "Show changes" chat link: jump to the Code tab with the diff switched on.
  const openChanges = (): void => {
    setShowChanges(true);
    setView("code");
    if (vertical) setMtab("game");
  };

  // Switch the game to an existing version: the server copies that version's
  // code into the game and moves the head pointer — no new version row.
  const switchToVersion = async (versionId: string): Promise<boolean> => {
    if (!game.id || reverting || thinking || versionId === game.currentGameVersionId)
      return false;
    setReverting(true);
    setError(null);
    try {
      const row = await restoreGameVersion(editorPorts(), game.id, versionId);
      setGame((g) => ({
        ...g,
        codeBundle: row.code_bundle,
        currentGameVersionId: row.current_game_version_id,
      }));
      router.refresh();
      return true;
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
      return false;
    } finally {
      setReverting(false);
    }
  };

  // Revert = step back to the previous version; Restore = forward to the
  // version the last revert left (session-local, like the old swap toggle).
  const revertCode = async (): Promise<void> => {
    if (reverted) {
      const redo = redoVersionRef.current;
      if (redo && (await switchToVersion(redo))) {
        redoVersionRef.current = null;
        setReverted(false);
      }
      return;
    }
    if (!previousVersionId) return;
    const leaving = game.currentGameVersionId;
    if (await switchToVersion(previousVersionId)) {
      redoVersionRef.current = leaving;
      setReverted(true);
    }
  };

  // Explicit version pick from the selector — plain switch, no redo memory.
  const selectVersion = (versionId: string): void => {
    redoVersionRef.current = null;
    setReverted(false);
    void switchToVersion(versionId);
  };

  // Manual editor save: stash the draft and ask about creating a new version.
  // The promise resolves once the dialog settles (true = saved, edit mode ends).
  const handleSaveEdit = (code: string): Promise<boolean> => {
    if (!game.id) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pendingEditRef.current = { code, resolve };
      setSaveAsNewVersion(true);
      setSaveEditOpen(true);
    });
  };

  const settleSaveEdit = (saved: boolean): void => {
    pendingEditRef.current?.resolve(saved);
    pendingEditRef.current = null;
    setSaveEditOpen(false);
  };

  const confirmSaveEdit = async (): Promise<void> => {
    const pending = pendingEditRef.current;
    if (!pending || !game.id || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      // Sanitized before sealing — once encrypted, no later layer can inspect it.
      const row = await saveCodeEdit(editorPorts(), game.id, pending.code, {
        isNewVersion: saveAsNewVersion,
      });
      // Head overwritten in place → refresh its cached code with the saved result.
      if (!saveAsNewVersion && row.current_game_version_id) {
        const headId = row.current_game_version_id;
        setVersionCodes((m) => ({ ...m, [headId]: row.code_bundle }));
      }
      setGame((g) => ({
        ...g,
        codeBundle: row.code_bundle,
        currentGameVersionId: row.current_game_version_id,
      }));
      redoVersionRef.current = null;
      setReverted(false);
      await loadVersions();
      settleSaveEdit(true);
      router.refresh();
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
      settleSaveEdit(false);
    } finally {
      setSavingEdit(false);
    }
  };

  // Selector entries, newest first; the viewer renders the short id itself and
  // hides the date on narrow screens.
  const versionOptions = versions.map((v) => ({
    id: v.id,
    dateLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v.created_at)),
  }));

  // Edit-mode search panel strings, keyed by CodeMirror's English defaults
  // (its phrase-translation contract; "$" is CodeMirror's placeholder).
  const searchPhrases: Record<string, string> = {
    Find: t("codeSearchFind"),
    Replace: t("codeSearchReplace"),
    next: t("codeSearchNext"),
    previous: t("codeSearchPrevious"),
    "match case": t("codeSearchMatchCase"),
    regexp: t("codeSearchRegexp"),
    "by word": t("codeSearchByWord"),
    replace: t("codeSearchReplaceNext"),
    "replace all": t("codeSearchReplaceAll"),
    close: t("codeSearchClose"),
    "Toggle replace": t("codeSearchToggleReplace"),
    "no results": t("codeSearchNoResults"),
    of: t("codeSearchOf"),
    "current match": t("codeSearchCurrentMatch"),
    "on line": t("codeSearchOnLine"),
    "replaced $ matches": t("codeSearchReplacedMatches"),
    "replaced match on line $": t("codeSearchReplacedOnLine"),
  };

  // ----- End version history ---------------------------------------------

  // Stage picked/pasted/dropped reference images: read → downscale to a bounded
  // JPEG → append (capped). Non-images and unreadable files are skipped silently.
  const addImages = async (files: File[]): Promise<void> => {
    const scaled: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const raw = await fileToDataUrl(file);
        const small = await downscaleDataUrl(raw, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
        if (small) scaled.push(small);
      } catch {
        /* unreadable file — skip */
      }
    }
    if (scaled.length) {
      setPendingImages((prev) => capImages(prev, scaled, MAX_ATTACHMENTS));
    }
  };

  // True when the OS drag payload includes files (not e.g. text selections).
  const hasFileDrag = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes("Files");

  const clearDragOver = (): void => {
    dragDepthRef.current = 0;
    setIsDragOver(false);
  };

  const onInboxDragEnter = (e: React.DragEvent): void => {
    if (composerLocked || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const onInboxDragLeave = (e: React.DragEvent): void => {
    if (!isDragOver) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) clearDragOver();
  };

  const onInboxDragOver = (e: React.DragEvent): void => {
    if (composerLocked || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onInboxDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    clearDragOver();
    if (composerLocked) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void addImages(files);
  };

  // The loop runs inside this tab — warn before any action that would kill it.
  // Only a plan turn dies with this screen. A build lives in the build store,
  // so moving around the app is fine (BuildActivityHost guards tab close).
  useNavigationGuard(isLocalBusy, t("leaveWhileRunningConfirm"));

  const stepLabel = (s: AgentStep): string => {
    const map: Record<AgentStep, string> = {
      thinking: t("stepThinking"),
      reading_docs: t("stepReadingDocs"),
      generating_image: t("stepGeneratingImage"),
      generating_preview: t("stepGeneratingPreview"),
      writing_code: t("stepWritingCode"),
      validating: t("stepValidating"),
      fixing_validation: t("stepFixingValidation"),
      visual_check: t("stepVisualCheck"),
      finalizing: t("stepFinalizing"),
    };
    return map[s];
  };

  // ----- Plan step --------------------------------------------------------

  /** The inspiration image of the surface the parent has open. */
  const planImage = planMode === "draw" ? sketchImage : photoImage;

  /**
   * One brainstorming turn with the plan agent. Runs in the browser on the
   * game provider (same key, same drivers as a build) and produces prose plus,
   * usually, a plan proposal — never code and never a game row.
   */
  async function sendPlanMessage(text: string, explicitImages?: string[]): Promise<void> {
    if (!text.trim() || thinking) return;
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    setError(null);
    setDraft("");
    // Every plan turn is answered in the thread. On a phone a surface hides
    // it, so leave whichever one the parent started from (sketch, plan); side
    // by side the thread is in view anyway and the surface can stay.
    if (vertical) setPlanSurface("chat");

    // The sketch/photo rides along the first message after it changed; later
    // turns refer back to it through the conversation.
    const fresh = explicitImages ?? (hasUnsentPlanImage && planImage ? [planImage] : []);
    const attachments = capImages([], [...fresh, ...pendingImages], MAX_ATTACHMENTS);
    setPendingImages([]);
    setHasUnsentPlanImage(false);

    const history = messages;
    const withUser: ChatMessage[] = [
      ...history,
      { role: "user", text, ...(attachments.length ? { images: attachments } : {}) },
    ];
    setMessages(withUser);
    setThinking(true);
    setNarration("");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await runPlanTurn(
        editorPorts(),
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
            aiUnavailable: t("aiUnavailable"),
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
        setThinking(false);
        setError(t("needProviderKey"));
        return;
      }
      if (outcome.kind === "stopped" || outcome.kind === "failed") {
        if (outcome.kind === "failed") {
          setError(t(outcome.reason === "ai_unavailable" ? "aiUnavailable" : "planFailed"));
        }
        const reply = outcome.reply;
        setMessages((m) => [...m, reply]);
        return;
      }
      if (outcome.plan !== null) {
        setPlanDraft(outcome.plan);
        setIsEditingPlan(false);
        // Side by side there is room to put the plan on the stage as it
        // arrives; on a phone it would cover the reply, so the pill waits.
        if (!vertical) setPlanSurface("plan");
      }
      if (outcome.reply) setMessages([...withUser, outcome.reply]);
    } finally {
      setThinking(false);
      setNarration("");
      abortRef.current = null;
    }
  }

  /**
   * Put a plan image (sketch or photo) into the composer, staged as an
   * attachment. Opening the conversation with it also fills in the matching
   * request as the message text, so the parent reads and adjusts what dodi is
   * asked before sending; once the conversation is under way the image just
   * joins whatever the parent writes next. Typed text is never overwritten.
   */
  const stagePlanImage = (
    image: string,
    promptKey: "planAnalyzePhotoPrompt" | "planAnalyzeSketchPrompt",
  ): void => {
    setPendingImages((prev) => capImages(prev, [image], MAX_ATTACHMENTS));
    setHasUnsentPlanImage(false);
    if (messages.length === 0) setDraft((d) => (d.trim() ? d : t(promptKey)));
  };

  /** Stage a photo of a real-world task for dodi to read. */
  const onPhotoPicked = async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) return;
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleDataUrl(raw, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
      });
      if (!small) return;
      setPhotoImage(small);
      stagePlanImage(small, "planAnalyzePhotoPrompt");
    } catch {
      /* unreadable file — the parent can pick another */
    }
  };

  const onSketchChange = (dataUrl: string | null): void => {
    setSketchImage(dataUrl);
    setHasUnsentPlanImage(Boolean(dataUrl));
  };

  /** "Attach to chat" on the sketch surface. On a phone the composer is behind
   *  the surface, so the surface closes to show the staged sketch. */
  const attachSketch = (): void => {
    if (!sketchImage) return;
    stagePlanImage(sketchImage, "planAnalyzeSketchPrompt");
    if (vertical) setPlanSurface("chat");
  };

  /**
   * Accept the plan on the table: derive the settings from the FINAL text (the
   * parent may have rewritten it), then move on to settings. A failed
   * derivation is not fatal — the parent fills the form themselves.
   */
  async function acceptPlan(): Promise<void> {
    const text = planDraft.trim();
    if (!text || isDerivingSettings || thinking) return;
    setIsDerivingSettings(true);
    setError(null);
    try {
      // Null: no game model resolves — the parent fills the form themselves.
      const settings = await derivePlanSettingsForStudio(editorPorts(), {
        planText: text,
        kids,
        primaryKidId,
        locale,
        defaultAgeMin: game.targetAgeMin,
        defaultAgeMax: game.targetAgeMax,
        gameId: () => gameIdRef.current,
      });
      // A name the parent typed themselves wins over a derived one.
      if (settings) setGame((g) => applyPlanSettings(g, settings));
    } catch (err) {
      console.error("[game-studio] deriving settings from the plan failed", err);
      setError(t("planSettingsFailed"));
    } finally {
      setIsDerivingSettings(false);
      setAcceptedPlan(text);
      setIsEditingPlan(false);
      setPlanSurface("chat");
      setView("settings");
    }
  }

  /** Skip planning: the draft carries no plan, so saving behaves as it always did. */
  const skipPlan = (): void => {
    setAcceptedPlan(null);
    setPlanSurface("chat");
    setView("settings");
  };

  /** Draw the screen you imagine — the sketch takes over the thread area. */
  const openSketchSurface = (): void => {
    setPlanMode("draw");
    setPlanSurface("sketch");
  };

  /** Photograph a worksheet: the camera opens, and the photo sends itself. */
  const openPlanCamera = (): void => {
    setPlanMode("photo");
    cameraInputRef.current?.click();
  };

  /** The camera from the composer: the plan's photo while planning, an
   *  attachment for the next message otherwise. */
  const openCamera = (): void => {
    if (isPlanMode) openPlanCamera();
    else cameraInputRef.current?.click();
  };

  /** Extra inputs for a build the studio starts itself (the accepted plan). */
  interface SendOptions {
    /** Images for THIS message, instead of whatever is staged in the composer. */
    images?: string[];
    /** The prompt is a plan the parent approved — build it, don't reinterpret it. */
    isAgreedPlan?: boolean;
  }

  /** The replies a build writes into the thread, in the parent's UI language. */
  const buildTexts = (): StudioBuildTexts => ({
    buildSummaryTitle: t("buildSummaryTitle"),
    stopped: t("stopped"),
    paused: t("buildPaused"),
    buildFailed: t("buildFailed"),
    aiUnavailable: t("aiUnavailable"),
    previewUpdated: t("previewUpdatedMessage"),
    previewUpdateFailed: t("previewUpdateFailedMessage"),
  });

  const resetBuildNotices = (): void => {
    setError(null);
    setBgNotice(null);
    setPreviewNotice(null);
    setVisualCheckNotice(false);
  };

  async function send(raw?: string, opts?: SendOptions): Promise<void> {
    const text = (raw ?? draft).trim();
    if (!text || thinking) return;
    // In the Plan step the same composer talks to the planning agent instead —
    // brainstorming, no code, no game row needed.
    if (isPlanMode) {
      await sendPlanMessage(text);
      return;
    }
    // New-game hard gate: a draft must be persisted (giving us a game id) before
    // Dodi can build. The composer is disabled in this state, but guard anyway.
    if (isComposerLocked || !game.id) {
      setError(t("saveBeforeBuild"));
      setView("settings");
      return;
    }
    // Defensive: the composer is disabled when no thinking model is configured,
    // but starter buttons / Enter could still reach here.
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    if (!primaryKidId) {
      setInvalid((v) => ({ ...v, audience: true }));
      setView("settings");
      return;
    }
    // One build per device: another game's build holds the slot.
    if (isOtherBuildRunning) {
      setError(t("otherBuildRunning"));
      return;
    }
    resetBuildNotices();
    setDraft("");
    // Attachments belong to this message — stage them and clear the strip. A
    // studio-started build (the accepted plan) brings its own image instead.
    const attachments = opts?.images ?? pendingImages;
    setPendingImages([]);
    // A new message supersedes an interrupted build of this game.
    if (resumable) {
      setResumable(null);
      void studioBuildStore.discardResumable(game.id);
    }
    // Show the new turn right away; the build's own thread takes over once
    // it runs, and the outcome's replaces both.
    const history = messages;
    setMessages([
      ...history,
      { role: "user", text, ...(attachments.length ? { images: attachments } : {}) },
    ]);
    setIsStartingBuildRun(true);

    // Edit tasks attach a screenshot of the current game so the model sees what
    // it is changing. Best-effort: capture failure → text-only edit.
    let screenshot: string | undefined;
    if (game.built && sandboxRef.current) {
      const raw = await sandboxRef.current
        .requestSnapshot({ preferGameCapture: game.capabilities.includes("get_snapshot") })
        .catch(() => null);
      const scaled = raw ? await downscaleDataUrl(raw, SCREENSHOT_BOUND) : null;
      screenshot = scaled ?? undefined;
    }

    // The build runs in the studio build store: it outlives this screen, and
    // the outcome comes back through `pendingOutcome` (applyBuildOutcome).
    // Starting it sets the store's active build synchronously, so the busy
    // state hands over without a gap.
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

  /** Continue this game's interrupted build from its checkpoint. */
  const resumeBuild = (): void => {
    if (!game.id || thinking || isOtherBuildRunning) return;
    resetBuildNotices();
    setResumable(null);
    void studioBuildStore.resume(game.id, buildTexts());
  };

  const discardResumableBuild = (): void => {
    if (!game.id) return;
    setResumable(null);
    void studioBuildStore.discardResumable(game.id);
  };

  /**
   * Take over a finished build: the thread, the game as built (already
   * persisted by the build), and the notices about what didn't happen.
   */
  const applyBuildOutcome = (outcome: StudioBuildOutcome): void => {
    if (outcome.kind === "no_provider") {
      setMessages(outcome.transcript);
      setError(t("needProviderKey"));
      return;
    }
    setMessages(outcome.transcript);
    const showSaveError = (reason: string): void =>
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));

    if (outcome.kind === "stopped" || outcome.kind === "paused") return;
    // A resumable failure's checkpoint is offered by the effect below, which
    // runs whenever a build of this game ends.
    if (outcome.kind === "failed") {
      setError(t(outcome.reason === "ai_unavailable" ? "aiUnavailable" : "buildFailed"));
      return;
    }
    if (outcome.kind === "preview_only") {
      if (!outcome.previewImage) {
        setPreviewNotice("failed");
        return;
      }
      const preview = outcome.previewImage;
      setGame((g) => ({ ...g, previewImage: preview }));
      if (outcome.saveError !== undefined) showSaveError(outcome.saveError);
      else router.refresh();
      return;
    }

    const { isCodeChanged, savedRow } = outcome;
    setBgNotice(outcome.backgroundNotice);
    setPreviewNotice(outcome.previewNotice);
    setVisualCheckNotice(outcome.hasVisualCheckNotice);
    setGame((g) => gameAfterBuild(g, outcome));
    if (isCodeChanged) {
      setReverted(false);
      redoVersionRef.current = null;
    }
    setView("preview");
    if (!savedRow) {
      showSaveError(outcome.saveError ?? "");
      return;
    }
    void loadVersions();
    if (adoptedIdRef.current) {
      // This studio adopted its id in place (planned draft → build) while
      // the router still points at /game-studio/new. Everything is
      // persisted now, so hand the route over to the game's own page.
      adoptedIdRef.current = false;
      router.replace(`/parent/game-studio/${game.id}/preview`);
    } else {
      router.refresh();
    }
  };

  // Adopt a finished build — the moment it ends while this screen watches, or
  // on return when it finished while the parent was elsewhere in the app.
  useEffect(() => {
    if (!pendingOutcome || !game.id) return;
    const outcome = studioBuildStore.takeOutcome(game.id);
    // Adopting the build store's result is syncing from an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (outcome) applyBuildOutcome(outcome);
    // applyBuildOutcome reads the live render; the outcome is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOutcome, game.id]);

  // Offer to continue a build that a reload, a closed tab or a dropped
  // connection interrupted (its checkpoint is sealed in this browser).
  useEffect(() => {
    const gameId = game.id;
    if (!gameId || activeBuild) return;
    let isCurrent = true;
    void studioBuildStore.findResumable(gameId).then((found) => {
      if (isCurrent) setResumable(found);
    });
    return () => {
      isCurrent = false;
    };
    // Checked on entry and whenever a build of this game ends.
  }, [game.id, activeBuild === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSettings(): Promise<void> {
    if (saving) return;
    // Mandatory fields: a title (brand-new games only), a learning goal, and a
    // child/audience. Empty ones are flagged red instead of showing a message.
    // (Server schemas stay permissive so voice/system game creation, which has
    // no parent goal, still works.)
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
      // DEBUG (mobile "Save & start building" does nothing): the red marker
      // may be scrolled out of view on a phone.
      console.warn("[game-studio] settings save blocked by validation:", invalidFields);
      reportErrorLog({
        context: "game_save",
        kidId: primaryKidId,
        gameId: gameIdRef.current,
        errorName: "SaveBlockedByValidation",
        errorMessage: `invalid fields: ${invalidFields}`,
      });
      setInvalid(nextInvalid);
      setView("settings");
      return;
    }
    setInvalid({});
    setError(null);
    setSaving(true);
    const savePlan = planSettingsSave({ isPlanning, hasAcceptedPlan: acceptedPlan !== null });
    if (savePlan.isBuildStart) {
      // Hand off to the agent view BEFORE the first await: the parent watches
      // the save land and the build start instead of a disabled button.
      setIsStartingBuild(true);
      setThinking(true);
      setNarration(t("savingSettings"));
      setViewState("preview");
      if (gameIdRef.current) {
        window.history.replaceState(null, "", studioUrl(gameIdRef.current, "preview"));
      }
      if (vertical) setMtab("chat");
    }
    // End the handoff in the same render that ends planning, so the auto-build
    // effect's send() sees thinking === false and starts the build.
    const finishHandoff = (): void => {
      if (!savePlan.isBuildStart) return;
      setThinking(false);
      setNarration("");
      setIsStartingBuild(false);
    };
    // DEBUG (mobile "Save & start building" does nothing): trace each awaited
    // step, and report the step a save is stuck on — phones have no console.
    const saveStartedAt = startFailureTimer();
    let saveStep = "await_planning_write";
    const markSaveStep = (next: string): void => {
      saveStep = next;
      console.debug("[game-studio] settings save:", next, `${Date.now() - saveStartedAt}ms`);
    };
    const saveWatchdog = setTimeout(() => {
      console.error("[game-studio] settings save stalled at", saveStep);
      reportErrorLog({
        context: "game_save",
        kidId: primaryKidId,
        gameId: gameIdRef.current,
        errorName: "SaveStalled",
        errorMessage: `settings save still pending after 20s (isPlanning=${isPlanning}, hasAcceptedPlan=${acceptedPlan !== null}, vertical=${vertical})`,
        meta: browserFailureMeta(saveStartedAt, { lastStep: saveStep }),
      });
    }, 20_000);
    try {
      // Let a planning write in flight land first (it may be the very create
      // that mints the id), and never queue another: this save ends planning.
      planningWriter().discard();
      markSaveStep("await_planning_write");
      await planningWriter().settled();
      const gameId = gameIdRef.current;
      if (gameId) {
        // Map the success definition to structured criteria IN THE BROWSER (the
        // provider key stays in the vault); send only the mapped result. With no
        // provider configured (or on a mapping error) we persist the text and
        // leave the existing criteria untouched. A build-starting save skips it:
        // the first build maps the definition itself and persists the criteria.
        const mapped = savePlan.shouldMapSuccessDefinition
          ? await mapSettingsSuccessDefinition(editorPorts(), game, markSaveStep)
          : null;
        if (mapped) setField("progressKind", mapped.progressKind);
        await patchGameSettings(editorPorts(), gameId, game, {
          mapped,
          isEndingPlanning: isPlanning,
          onStep: markSaveStep,
        });
        markSaveStep("save_listing_translations");
        await listingTranslations.save();
        markSaveStep("saved");

        if (isPlanning) {
          // Nothing left to persist from the Plan step; drop a queued write so
          // it cannot resurrect the envelope after this save.
          planningWriter().discard();
          setIsPlanning(false);
          if (acceptedPlan) {
            // A plan was agreed, so this save IS the start of the build (the
            // effect below starts it once the chat is unlocked). The view was
            // already handed over when the save began.
            pendingAutoBuildRef.current = {
              text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
              images: planImage ? [planImage] : [],
            };
            finishHandoff();
            return;
          }
          if (adoptedIdRef.current) {
            // The row was created by the first plan turn while the router
            // still points at /game-studio/new. Everything is persisted now,
            // so hand the route over to the game's own page (which is where
            // an unplanned draft's save always landed).
            adoptedIdRef.current = false;
            router.replace(studioUrl(gameId, "preview"));
            return;
          }
        }
      } else {
        // Persist a new game straight from settings (no build required). With no
        // code yet we seal the placeholder ourselves — the server can't write
        // plaintext into an encrypted column, and only we can read the marker
        // back to tell "unbuilt" from a real game.
        markSaveStep("create_game");
        // The Plan conversation rides along (sealed) so a reload shows what was
        // discussed, not an empty thread.
        const newGameId = await createGameFromSettings(editorPorts(), {
          kidId: primaryKidId,
          game,
          transcript: messages,
        });
        setIsPlanning(false);

        if (acceptedPlan) {
          // A plan was agreed, so this save IS the start of the build. Adopt the
          // new id in place instead of navigating: a router push would remount
          // the studio and take the plan thread, the sketch and the queued build
          // with it. The URL is corrected here, and the route is handed over to
          // the game's own page once the build has persisted (see send()).
          pendingAutoBuildRef.current = {
            text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
            images: planImage ? [planImage] : [],
          };
          adoptedIdRef.current = true;
          gameIdRef.current = newGameId;
          setGame((g) => ({ ...g, id: newGameId }));
          window.history.replaceState(null, "", studioUrl(newGameId, "preview"));
          finishHandoff();
          return;
        }

        // Move to the draft's own URL so the build binds to this id and
        // reload/recovery works. The chat unlocks on the [id] route.
        router.push(`/parent/game-studio/${newGameId}`);
        return;
      }
      setJustSaved(true);
      router.refresh();
      setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      console.error("[game-studio] settings save failed at", saveStep, e);
      reportErrorLog({
        context: "game_save",
        kidId: primaryKidId,
        gameId: gameIdRef.current,
        ...describeError(e, []),
        meta: browserFailureMeta(saveStartedAt, { lastStep: saveStep }),
      });
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
      if (savePlan.isBuildStart) {
        // Back to the form: its error line shows why, and Save retries.
        pendingAutoBuildRef.current = null;
        finishHandoff();
        setView("settings");
        if (vertical) setMtab("game");
      }
    } finally {
      clearTimeout(saveWatchdog);
      setIsStartingBuild(false);
      setSaving(false);
    }
  }

  // Start the build queued by an accepted plan, once the id is live and the
  // chat is unlocked. Deliberately an effect and not a call inside
  // saveSettings: send() reads game.id and the lock from its closure, which
  // are still the pre-save values in the render that saved.
  useEffect(() => {
    const pending = pendingAutoBuildRef.current;
    if (!pending || !game.id || isPlanning) return;
    pendingAutoBuildRef.current = null;
    void send(pending.text, { images: pending.images, isAgreedPlan: true });
    // Fires exactly once per save; send() is stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, isPlanning]);

  // Flip the game's active state straight from the studio header — an optimistic
  // auto-save so parents can activate/deactivate without opening settings. The
  // switch reverts if the PATCH fails.
  async function toggleActive(): Promise<void> {
    if (!game.id || togglingActive) return;
    const next = !game.isActive;
    const gameId = game.id;
    setField("isActive", next);
    setTogglingActive(true);
    setError(null);
    try {
      // The kid library reads is_active from the game cache, so the core flips
      // it there too (and back on failure).
      await setGameActive(editorPorts(), gameId, next);
      router.refresh();
    } catch (e) {
      setField("isActive", !next); // revert the optimistic flip
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
    } finally {
      setTogglingActive(false);
    }
  }

  const starters = [
    t("starterCounting"),
    t("starterMath"),
    t("starterStory"),
    t("starterDrawing"),
  ];

  // In the Plan step dodi is a brainstorming partner, not a builder — the
  // progress steps belong to a build and never fire here.
  const statusText = isPlanMode
    ? thinking
      ? t("planThinking")
      : t("plannerRole")
    : thinking
      ? step
        ? stepLabel(step)
        : t("working")
      : t("designerRole");

  // The turn links attach only to the LAST code-changing reply — the stored
  // previous version corresponds to exactly that change.
  const lastChangeIndex = messages.reduce(
    (last, m, i) => (m.hasCodeChange ? i : last),
    -1,
  );

  // The Plan step's surfaces are the same on every layout; only where they
  // render differs (the stage side by side, the chat pane on a phone).
  const renderPlanSurface = (): React.ReactNode => {
    if (planSurface === "sketch") {
      return (
        <PlanSketchSurface
          strokes={sketchStrokes}
          onStrokesChange={setSketchStrokes}
          onChange={onSketchChange}
          onAttach={attachSketch}
          onBack={() => setPlanSurface("chat")}
          isBusy={thinking}
          t={t}
        />
      );
    }
    if (planSurface === "plan") {
      return (
        <PlanSurface
          onBack={() => setPlanSurface("chat")}
          planDraft={planDraft}
          isEditingPlan={isEditingPlan}
          onPlanDraftChange={setPlanDraft}
          onToggleEdit={() => setIsEditingPlan((v) => !v)}
          onAccept={() => void acceptPlan()}
          onSkip={skipPlan}
          onPersonalize={() => void sendPlanMessage(t("planChipPersonalize"))}
          isBusy={thinking}
          isDerivingSettings={isDerivingSettings}
          t={t}
        />
      );
    }
    return null;
  };

  return (
    <div
      className={cn(studioFrame.webRoot, studioFrame.root)}
      data-screen-label={editing ? "Parent — Edit game" : "Parent — New game"}
    >
      {/* Mobile tab bar (vertical layout only; hidden while the Dodi pane is
          gated away — a draft past the Plan step and before its first save —
          and during the Plan step, which owns the whole screen). */}
      {panes.showTabBar && (
        <div className={cn(studioTabBar.web, studioTabBar.box)}>
          <StudioTab
            active={mtab === "game"}
            onClick={() => setMtab("game")}
            icon="show"
            label={t("tabGame")}
          />
          <StudioTab
            active={mtab === "chat"}
            onClick={() => setMtab("chat")}
            icon="sparkles"
            label={t("tabDodi")}
          />
        </div>
      )}

      {/* Two-pane: main stage + chat sidebar */}
      <div
        className={cn(
          studioFrame.webPanes,
          studioFrame.panes,
          vertical ? studioFrame.panesVertical : studioFrame.webPanesSide,
        )}
      >
        {/* Main stage */}
        <div
          className={cn(
            // min-w-0: let a wide Code view scroll inside the pane instead of
            // widening it and squeezing the Dodi sidebar.
            studioFrame.webMain,
            studioFrame.main,
            !panes.showMain && "hidden",
          )}
        >
          <div
            className={cn(
              stageHeader.web,
              stageHeader.box,
              // The Plan step's surfaces bring their own header; the stage
              // switch returns once the plan is accepted or skipped.
              isPlanMode && "hidden",
            )}
          >
            {/* One switch for the whole stage — Preview / Code / Settings (the
                settings gear folded in as a tab), plus Plan while the game is
                still a draft. */}
            <div className={cn(studioSeg.webGroup, studioSeg.group)}>
              {isPlanning && (
                <SegTab active={view === "plan"} onClick={() => setView("plan")} icon="pencil" label={t("plan")} />
              )}
              <SegTab active={view === "settings"} onClick={() => setView("settings")} icon="settings" label={t("settings")} />
              <SegTab active={view === "code"} onClick={() => setView("code")} icon="code" label={t("code")} />
              <SegTab active={view === "preview"} onClick={() => setView("preview")} icon="show" label={t("preview")} />
            </div>
            {view === "preview" && previewHasTranslations && (
              <div
                role="group"
                aria-label={t("previewLanguage")}
                className={cn(studioSeg.webGroup, studioSeg.group)}
              >
                {locales.map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={previewLocale === code}
                    onClick={() => setPreviewLocaleChoice(code)}
                    className={cn(
                      previewLocaleStyle.box,
                      previewLocaleStyle.text,
                      previewLocaleStyle.web,
                      previewLocale === code
                        ? cn(previewLocaleStyle.active, previewLocaleStyle.activeText, previewLocaleStyle.webActive)
                        : cn(previewLocaleStyle.idleText, previewLocaleStyle.webIdle),
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
            {/* Audience + active state only exist once the game is created. */}
            {game.id && (
              <div className={cn(stageHeader.webRight, stageHeader.right)}>
                {(game.isFamily || selectedKids.length > 0) && (
                  <div className="hidden items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground sm:flex">
                    <span>{t("forLabel")}</span>
                    {game.isFamily ? (
                      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {t("family")}
                      </span>
                    ) : (
                      <span className="flex items-center -space-x-1.5">
                        {selectedKids.slice(0, 3).map((k) => (
                          <span
                            key={k.id}
                            className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-card bg-primary-soft text-[11px] font-bold text-primary"
                            title={k.name}
                          >
                            {k.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {/* Status is an auto-saving switch — flip active/inactive without
                    opening settings. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={game.isActive}
                  aria-label={t("visibilityLabel")}
                  title={t("activeHint")}
                  onClick={() => void toggleActive()}
                  disabled={togglingActive}
                  className={cn(
                    activeToggle.box,
                    activeToggle.text,
                    activeToggle.web,
                    game.isActive
                      ? cn(activeToggle.on, activeToggle.onText)
                      : cn(activeToggle.off, activeToggle.offText, activeToggle.webOff),
                  )}
                >
                  <span
                    className={cn(
                      activeToggle.track,
                      activeToggle.webTrack,
                      game.isActive ? activeToggle.trackOn : activeToggle.trackOff,
                    )}
                  >
                    <span
                      className={cn(
                        activeToggle.thumb,
                        activeToggle.webThumb,
                        game.isActive ? activeToggle.thumbOn : activeToggle.thumbOff,
                      )}
                    />
                  </span>
                  {game.isActive ? t("active") : t("inactive")}
                </button>
              </div>
            )}
          </div>

          <div className={cn(stageBody.box, stageBody.web)}>
            {/* The stage stays mounted whenever code exists (hidden by CSS on the
                other tabs) so the sandbox can serve edit-time screenshot capture
                without a reload — hiding instead of unmounting keeps layout alive
                for the DOM rasterizer. In the vertical layout's chat tab the whole
                pane is display:none; capture degrades there (canvas still works,
                DOM rasterization may return null → text-only edit). */}
            {game.codeBundle && (
              <div
                aria-hidden={view !== "preview" || undefined}
                className={cn(
                  stageBody.webCenter,
                  stageBody.center,
                  view !== "preview" &&
                    "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden",
                )}
              >
                <GameStage
                  // Locale is fixed at init — remount on switch so the game
                  // re-renders its text in the newly picked language.
                  key={previewLocale}
                  gameId={game.id ?? "preview"}
                  codeBundle={game.codeBundle}
                  locale={previewLocale}
                  reserved={STAGE.reservedStudio}
                  sandboxRef={sandboxRef}
                />
              </div>
            )}
            {view === "preview" && !game.codeBundle && (
              <div className={cn(stageBody.webCenter, stageBody.center)}>
                <EmptyStage title={t("previewEmpty")} />
              </div>
            )}
            {view === "code" &&
              (game.codeBundle ? (
                <CodeViewer
                  code={game.codeBundle}
                  previousCode={previousCode}
                  showChanges={showChanges}
                  onShowChangesChange={setShowChanges}
                  versions={versionOptions}
                  currentVersionId={game.currentGameVersionId}
                  onSelectVersion={selectVersion}
                  busy={thinking || reverting}
                  onSaveEdit={game.id ? handleSaveEdit : undefined}
                  copyLabel={t("copy")}
                  copiedLabel={t("copied")}
                  showChangesLabel={t("showChanges")}
                  showChangesUnavailableTitle={t("noPreviousVersion")}
                  unchangedLabel={(count) => t("unchangedLines", { count })}
                  editLabel={t("editCode")}
                  editSaveLabel={t("editCodeSave")}
                  editCancelLabel={t("editCodeCancel")}
                  versionSelectorLabel={t("versionSelector")}
                  searchPhrases={searchPhrases}
                />
              ) : (
                <div className={cn(stageBody.webCenterCode, stageBody.centerCode)}>
                  <EmptyStage title={t("codeEmpty")} icon="code" />
                </div>
              ))}
            {/* Side by side, a plan surface takes the stage (on a phone it
                renders inside the chat pane instead, see below). */}
            {isPlanMode && !vertical && planSurface !== "chat" && (
              <div className="absolute inset-0 flex flex-col">{renderPlanSurface()}</div>
            )}
            {view === "settings" && (
              <SettingsForm
                game={game}
                kids={kids}
                invalid={invalid}
                setField={setField}
                selectFamily={selectFamily}
                toggleKid={toggleKid}
                onSave={saveSettings}
                saving={saving}
                justSaved={justSaved}
                error={error}
                hasImageProvider={hasImageProvider}
                isPlanning={isPlanning}
                hasAcceptedPlan={Boolean(acceptedPlan)}
                listingTranslations={listingTranslations}
                listingSourceLocale={listingSourceLocale}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Chat sidebar — the right menu stays hidden for a brand-new game
            until the draft is saved (which mints the game id and unlocks the
            studio); the settings form fills the pane on its own until then.
            Drop zone for reference images (same path as paste / file picker). */}
        <div
          style={vertical || chatFullscreen ? undefined : { width: sideWidth }}
          className={cn(
            studioFrame.webChat,
            studioFrame.chat,
            !panes.showChat && "hidden",
            vertical || chatFullscreen ? studioFrame.chatVertical : studioFrame.webChatSide,
          )}
          onDragEnter={onInboxDragEnter}
          onDragLeave={onInboxDragLeave}
          onDragOver={onInboxDragOver}
          onDrop={onInboxDrop}
        >
          {/* Drop overlay — visible while files are dragged over the inbox. */}
          {isDragOver && !composerLocked && (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-primary-soft/90 px-6 text-center backdrop-blur-[2px]"
              aria-hidden
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card/80 text-primary">
                <Icon name="photo" size={28} />
              </div>
              <p className="text-sm font-semibold text-primary">{t("dropImages")}</p>
              <p className="text-xs font-medium text-primary/80">
                {pendingImages.length >= MAX_ATTACHMENTS
                  ? t("attachLimitReached")
                  : t("dropImagesHint")}
              </p>
            </div>
          )}
          {/* Resize handle (horizontal layout only, and only as a sidebar) */}
          {!vertical && !chatFullscreen && (
            <div
              onMouseDown={startSideResize}
              className="group absolute -left-1 bottom-0 top-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center"
              title="Drag to resize"
            >
              <span className="h-7 w-0.5 rounded bg-border-strong transition-all group-hover:h-11 group-hover:bg-primary" />
            </div>
          )}

          {/* Header */}
          <div
            className={cn(
              chatHeader.web,
              chatHeader.box,
              mobileSurfaceOpen && "hidden",
            )}
          >
            <div className={cn(chatHeader.webAvatar, chatHeader.avatar)}>
              <Image
                src="/images/dodi-head-active.png"
                alt=""
                width={36}
                height={36}
                className={cn(chatHeader.avatarImage, chatHeader.webAvatarImage)}
              />
            </div>
            <div className={chatHeader.info}>
              <div className={chatHeader.name}>{t("designerName")}</div>
              <div className={cn(chatHeader.webStatus, chatHeader.status, chatHeader.statusText)}>
                <span
                  className={cn(
                    chatHeader.webDot,
                    chatHeader.dot,
                    thinking ? cn(chatHeader.webDotBusy, chatHeader.dotBusy) : chatHeader.dotIdle,
                  )}
                />
                <span className={chatHeader.webStatusLabel}>{statusText}</span>
              </div>
            </div>
            {/* Clear the conversation history (also available by typing /clear). */}
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={thinking || messages.length === 0}
              title={t("clearHistory")}
              aria-label={t("clearHistory")}
              className={cn(chatHeader.clear, chatHeader.webClear)}
            >
              <Icon name="delete" size={16} />
            </button>
          </div>

          {/* The Plan step's own controls, pinned under the header so they stay
              reachable while the thread scrolls. On a phone an open surface has
              its own header instead. */}
          {isPlanMode && !mobileSurfaceOpen && messages.length > 0 && (
            <PlanActionRow
              hasPlan={hasPlan}
              activeSurface={planSurface}
              compact={vertical}
              onDrawSketch={openSketchSurface}
              onTakePhoto={openPlanCamera}
              onOpenPlan={() => setPlanSurface("plan")}
              onSkip={skipPlan}
              isBusy={thinking}
              isDerivingSettings={isDerivingSettings}
              needsGameProvider={needsGameProvider}
              t={t}
            />
          )}

          {/* The camera, reachable from the chat pane. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (isPlanMode) void onPhotoPicked(file);
              else void addImages([file]);
            }}
          />

          {/* On a phone a plan surface takes the thread's place. The thread is
              hidden, not unmounted, so it comes back where the parent left it. */}
          {mobileSurfaceOpen && renderPlanSurface()}

          {/* Thread */}
          <div
            ref={threadRef}
            className={cn(chatThread.box, chatThread.web, mobileSurfaceOpen && "hidden")}
          >
            <div
              className={cn(
                chatThread.webInner,
                chatThread.inner,
                chatFullscreen && "mx-auto w-full max-w-[640px]",
              )}
            >
              {messages.length === 0 ? (
                <div
                  className={cn(
                    chatWelcome.web,
                    chatWelcome.box,
                    chatWelcome.text,
                    // The phone's Plan step needs the height for its actions.
                    isMobilePlan ? chatWelcome.plan : chatWelcome.idle,
                  )}
                >
                  {!isMobilePlan && (
                    <Image
                      src="/images/dodi-active.png"
                      alt=""
                      width={56}
                      height={56}
                      className={cn(chatWelcome.image, chatWelcome.webImage)}
                    />
                  )}
                  <h2 className={chatWelcome.title}>
                    {t(isPlanMode ? "planWelcomeTitle" : "welcomeTitle")}
                  </h2>
                  <p className={chatWelcome.description}>
                    {t(isPlanMode ? "planWelcomeDesc" : "welcomeDesc")}
                  </p>
                  {isPlanMode ? (
                    <PlanEmptyActions
                      hasPlan={hasPlan}
                      onIdea={() => void send(t("planStarterIdea"))}
                      onDrawSketch={openSketchSurface}
                      onTakePhoto={openPlanCamera}
                      onOpenPlan={() => setPlanSurface("plan")}
                      onSkip={skipPlan}
                      isBusy={thinking}
                      isDerivingSettings={isDerivingSettings}
                      needsGameProvider={needsGameProvider}
                      t={t}
                    />
                  ) : (
                    !needsGameProvider && (
                      <div className={cn(chatWelcome.webList, chatWelcome.list)}>
                        {starters.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void send(s)}
                            className={cn(studioActionRow.box, studioActionRow.text, studioActionRow.web)}
                          >
                            <Icon name="sparkles" size={14} className="shrink-0 text-primary" />
                            {s}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === "assistant" ? (
                    <div key={i} className={cn(chatMessage.webRow, chatMessage.row)}>
                      <Image
                        src="/images/dodi-head-active.png"
                        alt=""
                        width={30}
                        height={30}
                        className={cn(chatMessage.avatar, chatMessage.webAvatar)}
                      />
                      <div className={cn(chatMessage.body, chatMessage.bodyText)}>
                        <RichText text={m.text} />
                        {m.run && <AgentRunHistory run={m.run} />}
                        {i === lastChangeIndex && (canDiff || reverted) && (
                          <div className={cn(chatMessage.webLinks, chatMessage.links, chatMessage.linksText)}>
                            <button
                              type="button"
                              onClick={openChanges}
                              className={chatMessage.webLink}
                            >
                              {t("showChanges")}
                            </button>
                            <span aria-hidden>|</span>
                            <button
                              type="button"
                              onClick={() => void revertCode()}
                              disabled={reverting || thinking}
                              className={cn(chatMessage.webLink, chatMessage.webLinkDisableable)}
                            >
                              {reverted ? t("restoreVersion") : t("revertVersion")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className={cn(chatMessage.webUserRow, chatMessage.userRow)}>
                      <div className={cn(chatMessage.bubble, chatMessage.bubbleText)}>
                        {m.images && m.images.length > 0 && (
                          <div className={cn(chatMessage.webImages, chatMessage.images)}>
                            {m.images.map((img, j) => (
                              // Raw <img>: attachments are data URLs (next/image can't optimize them).
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={j}
                                src={img}
                                alt=""
                                className={cn(chatMessage.image, chatMessage.webImage)}
                              />
                            ))}
                          </div>
                        )}
                        <RichText text={m.text} />
                      </div>
                    </div>
                  ),
                )
              )}
              {thinking && (
                <div className={cn(chatMessage.webRow, chatMessage.row)}>
                  <Image
                    src="/images/dodi-head-active.png"
                    alt=""
                    width={30}
                    height={30}
                    className={cn(chatMessage.avatar, chatMessage.webAvatar)}
                  />
                  <div className={chatMessage.body}>
                    <div className={cn(chatThinking.webDots, chatThinking.dots)}>
                      {chatThinking.webDotDelays.map((delay) => (
                        <span key={delay} className={cn(chatThinking.dot, chatThinking.webDot, delay)} />
                      ))}
                    </div>
                    {liveRun && <AgentRunTimeline run={liveRun} isLive />}
                    {/* No aria-live: announcing every streamed delta would spam
                        screen readers — the header status line carries progress. */}
                    {narration.trim() && (
                      <p className={cn(chatThinking.narration, chatThinking.webNarration)}>
                        {narration.trim()}
                      </p>
                    )}
                    {step === "writing_code" && writeChars > 0 && (
                      <p className={chatThinking.writeProgress}>
                        {t("writeProgress", { chars: writeChars })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div
            ref={composerRef}
            className={cn(
              composer.box,
              chatFullscreen && "mx-auto w-full max-w-[640px]",
            )}
          >
            {needsGameProvider && (
              <div className={warningNotice}>
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>
                  {t("needThinkingProvider")}{" "}
                  <Link
                    href="/parent/settings/ai-providers"
                    className={cn(composerNotice.link, composerNotice.webLink)}
                  >
                    {t("openSettings")}
                  </Link>
                </span>
              </div>
            )}
            {thinking && (
              <div className={primaryNotice}>
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t(activeBuild ? "buildRunningHint" : "agentRunningWarning")}</span>
              </div>
            )}
            {resumable && !thinking && (
              <div className={cn(composerNotice.web, composerNotice.resume, composerNotice.resumeText)}>
                <span className={composerNotice.resumeLabel}>{t("resumeBuildNotice")}</span>
                <Button size="sm" onClick={resumeBuild} disabled={isOtherBuildRunning}>
                  {t("resumeBuild")}
                </Button>
                <Button size="sm" variant="ghost" onClick={discardResumableBuild}>
                  {t("discardResumableBuild")}
                </Button>
              </div>
            )}
            {error && (
              <div className={cn(composerNotice.error, composerNotice.errorText)}>
                {error}
              </div>
            )}
            {bgNotice && (
              <div className={warningNotice}>
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t(bgNotice === "failed" ? "bgFailedNotice" : "bgSkippedNotice")}</span>
              </div>
            )}
            {previewNotice && (
              <div className={warningNotice}>
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>
                  {t(previewNotice === "failed" ? "previewFailedNotice" : "previewSkippedNotice")}
                </span>
              </div>
            )}
            {visualCheckNotice && (
              <div className={warningNotice}>
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t("visualCheckFailedNotice")}</span>
              </div>
            )}
            <div className={cn(composer.card, composer.webCard)}>
              {/* Composer top resize handle (horizontal layout only) */}
              {!vertical && (
                <div
                  onMouseDown={startComposerResize}
                  className="group absolute -top-1.5 left-0 right-0 z-10 flex h-3 cursor-ns-resize items-center justify-center"
                  title="Drag to resize"
                >
                  <span className="h-[3px] w-8 rounded bg-border-strong transition-all group-hover:w-12 group-hover:bg-primary" />
                </div>
              )}
              {pendingImages.length > 0 && (
                <div className={cn(composer.webPending, composer.pending)}>
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative">
                      {/* Raw <img>: staged attachments are data URLs. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt=""
                        className={cn(composer.pendingImage, composer.webPendingImage)}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPendingImages((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={t("removeImage")}
                        className={cn(composer.remove, composer.webRemove)}
                      >
                        <Icon name="close" size={11} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                style={{
                  height: !mobileSurfaceOpen
                    ? composerHeight
                    : draft.trim()
                      ? Math.min(composerHeight, COMPOSER_SURFACE_MAX)
                      : COMPOSER_ONE_LINE,
                }}
                disabled={composerLocked}
                enterKeyHint={isTouch ? "enter" : "send"}
                className={cn(composer.input, composer.inputText, composer.webInput)}
                placeholder={
                  needsGameProvider
                    ? t("composerPlaceholderNoThinking")
                    : isPlanMode
                      ? t("planComposerPlaceholder")
                      : messages.length === 0
                        ? t("composerPlaceholderEmpty")
                        : t("composerPlaceholder")
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items)
                    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                    .map((item) => item.getAsFile())
                    .filter((f): f is File => f !== null);
                  if (files.length) {
                    e.preventDefault();
                    void addImages(files);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    isComposerSendKey(
                      {
                        key: e.key,
                        shiftKey: e.shiftKey,
                        isComposing: e.nativeEvent.isComposing,
                      },
                      { isTouch },
                    )
                  ) {
                    e.preventDefault();
                    // Slash-command: "/clear" wipes the conversation (with confirm).
                    if (draft.trim() === "/clear") {
                      setDraft("");
                      setClearOpen(true);
                      return;
                    }
                    void send();
                  }
                }}
              />
              <div className={cn(composer.webActions, composer.actions)}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void addImages(files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setAttachSheetOpen(true)}
                  disabled={composerLocked || pendingImages.length >= MAX_ATTACHMENTS}
                  aria-label={t("attachImage")}
                  title={
                    pendingImages.length >= MAX_ATTACHMENTS
                      ? t("attachLimitReached")
                      : t("attachImage")
                  }
                  className={cn(composer.attach, composer.webAttach)}
                >
                  <Icon name="photo" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => (thinking ? stop() : void send())}
                  disabled={composerLocked || (thinking ? false : !draft.trim())}
                  aria-label={thinking ? t("stop") : t("send")}
                  className={cn(
                    composer.send,
                    composer.webSend,
                    (thinking ? true : draft.trim() && !composerLocked)
                      ? cn(composer.sendOn, composer.webSendOn)
                      : composer.sendOff,
                  )}
                >
                  <Icon name={thinking ? "stop" : "send"} size={17} />
                </button>
              </div>
            </div>
            <p
              className={cn(
                composer.footer,
                mobileSurfaceOpen && "hidden",
              )}
            >
              {t("footer")}
            </p>
          </div>
        </div>
      </div>

      {/* The composer's image button: camera, file, or (while planning) a sketch. */}
      <ReferenceImageSheet
        open={attachSheetOpen}
        onOpenChange={setAttachSheetOpen}
        anchorRef={composerRef}
        onTakePhoto={openCamera}
        onUpload={() => fileInputRef.current?.click()}
        onDraw={isPlanMode ? openSketchSurface : undefined}
        t={t}
      />

      {/* Manual code-edit save — offers to snapshot the change as a new
          version (default on); declining overwrites the current head. */}
      <Dialog
        open={saveEditOpen}
        onOpenChange={(open) => {
          if (!open && !savingEdit) settleSaveEdit(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveEditTitle")}</DialogTitle>
            <DialogDescription>{t("saveEditDescription")}</DialogDescription>
          </DialogHeader>
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
            <Switch checked={saveAsNewVersion} onCheckedChange={setSaveAsNewVersion} />
            {t("saveEditNewVersion")}
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingEdit}
              onClick={() => settleSaveEdit(false)}
            >
              {t("saveEditCancel")}
            </Button>
            <Button disabled={savingEdit} onClick={() => void confirmSaveEdit()}>
              {t("saveEditConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive confirm for clearing the conversation history. */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearHistoryConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("clearHistoryConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              {t("clearHistoryCancel")}
            </Button>
            <Button variant="destructive" onClick={clearHistory}>
              {t("clearHistoryConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function SegTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        studioSeg.box,
        studioSeg.text,
        studioSeg.web,
        active
          ? cn(studioSeg.active, studioSeg.activeText, studioSeg.webActive)
          : cn(studioSeg.idleText, studioSeg.webIdle),
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

/** Full-width Game/Dodi switch shown above the panes in the vertical layout. */
function StudioTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        studioTab.box,
        studioTab.text,
        studioTab.web,
        active
          ? cn(studioTab.active, studioTab.activeText)
          : cn(studioTab.idle, studioTab.idleText),
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

function EmptyStage({ title, icon = "games" }: { title: string; icon?: "games" | "code" }) {
  return (
    <div className={cn(emptyStage.box, emptyStage.text)}>
      <div className={cn(emptyStage.webIconBox, emptyStage.iconBox)}>
        <Icon name={icon} size={emptyStage.icon.size} />
      </div>
      <div className={emptyStage.title}>{title}</div>
    </div>
  );
}

function AudienceButton({
  selected,
  onClick,
  label,
  icon,
  initial,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: IconName;
  initial?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        audiencePill.box,
        audiencePill.text,
        audiencePill.web,
        selected
          ? cn(audiencePill.selected, audiencePill.selectedText)
          : cn(audiencePill.idle, audiencePill.idleText, audiencePill.webIdle),
      )}
    >
      {icon ? (
        <Icon name={icon} size={16} className={selected ? "text-primary" : "text-muted-foreground"} />
      ) : (
        <span className={cn(audiencePill.webInitial, audiencePill.initial, audiencePill.initialText)}>
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}

function SettingsForm({
  game,
  kids,
  invalid,
  setField,
  selectFamily,
  toggleKid,
  onSave,
  saving,
  justSaved,
  error,
  hasImageProvider,
  isPlanning,
  hasAcceptedPlan,
  listingTranslations,
  listingSourceLocale,
  t,
}: {
  game: StudioGame;
  kids: KidOption[];
  invalid: { title?: boolean; learningGoal?: boolean; audience?: boolean; age?: boolean };
  setField: <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => void;
  selectFamily: () => void;
  toggleKid: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  justSaved: boolean;
  error: string | null;
  /** Image model configured + key available (null = still loading). */
  hasImageProvider: boolean | null;
  /** Still in the Plan step: this save is the first, mandatory one. */
  isPlanning: boolean;
  /** A plan was agreed in the Plan step — saving starts the build right away. */
  hasAcceptedPlan: boolean;
  listingTranslations: ListingTranslations;
  /** The game's own (the child's) language, marked on its listing card (null = unknown). */
  listingSourceLocale: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className={cn(studioSettings.webForm, studioSettings.form)}>
      <Field label={t("gameName")} required>
        <Input
          value={game.title}
          placeholder={t("gameNamePlaceholder")}
          aria-invalid={invalid.title || undefined}
          aria-required
          onChange={(e) => setField("title", e.target.value)}
        />
      </Field>

      <Field label={t("forKid")} required>
        <div
          className={cn(
            studioSettings.webChips,
            studioSettings.chips,
            invalid.audience && cn(studioSettings.chipsInvalid, studioSettings.webChipsInvalid),
          )}
        >
          <AudienceButton
            selected={game.isFamily}
            onClick={selectFamily}
            icon="friends"
            label={t("family")}
          />
          {kids.map((k) => (
            <AudienceButton
              key={k.id}
              selected={!game.isFamily && game.audienceIds.includes(k.id)}
              onClick={() => toggleKid(k.id)}
              initial={k.name.charAt(0).toUpperCase()}
              label={k.name}
            />
          ))}
        </div>
      </Field>

      {/* Active/inactive lives in the studio header now (an auto-saving switch),
          so the settings form no longer duplicates it. */}

      <Field label={t("learningGoal")} required>
        <textarea
          className={cn(studioTextarea.goal, studioTextarea.box, studioTextarea.text, studioTextarea.web, studioTextarea.webInvalid)}
          value={game.learningGoal}
          placeholder={t("learningGoalPlaceholder")}
          aria-invalid={invalid.learningGoal || undefined}
          aria-required
          onChange={(e) => setField("learningGoal", e.target.value)}
        />
      </Field>

      <Field
        label={t("successDefinition")}
        hint={game.successDefinition ? t("progressKindGoal") : t("progressKindOpen")}
      >
        <textarea
          className={cn(studioTextarea.success, studioTextarea.box, studioTextarea.text, studioTextarea.web)}
          value={game.successDefinition}
          placeholder={t("successPlaceholder")}
          onChange={(e) => setField("successDefinition", e.target.value)}
        />
      </Field>

      <Field label={t("tags")} hint={t("tagsHint")}>
        <TagPicker selected={game.tags} onChange={(tags) => setField("tags", tags)} />
      </Field>

      <Field
        label={t("recommendedAge")}
        hint={invalid.age ? undefined : t("recommendedAgeHint")}
      >
        <AgeRange
          min={game.targetAgeMin}
          max={game.targetAgeMax}
          onMinChange={(v) => setField("targetAgeMin", v)}
          onMaxChange={(v) => setField("targetAgeMax", v)}
          minLabel={t("ageMinLabel")}
          maxLabel={t("ageMaxLabel")}
        />
        {invalid.age && (
          <p className={studioSettings.error}>{t("ageRangeInvalid")}</p>
        )}
      </Field>

      <Field label={t("perspectiveLabel")} hint={t("perspectiveHint")}>
        <div className={cn(studioSettings.webChips, studioSettings.chips)} role="radiogroup" aria-label={t("perspectiveLabel")}>
          {(
            [
              [null, t("perspectiveUnspecified")],
              ["bird", t("perspectiveBird")],
              ["side", t("perspectiveSide")],
              ["isometric", t("perspectiveIsometric")],
            ] as Array<[GamePerspective | null, string]>
          ).map(([value, label]) => {
            const selected = game.perspective === value;
            return (
              <button
                key={value ?? "unspecified"}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setField("perspective", value)}
                className={cn(
                  optionChip.box,
                  optionChip.text,
                  optionChip.web,
                  selected
                    ? cn(optionChip.selected, optionChip.selectedText)
                    : cn(optionChip.idle, optionChip.idleText, optionChip.webIdle),
                )}
              >
                {label}
                {selected && <Icon name="check" size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={t("backgroundImageLabel")}
        hint={hasImageProvider === false ? undefined : t("backgroundImageHint")}
      >
        <div className={cn(studioSettings.webStack, studioSettings.stack)}>
          <label className={cn(studioSettings.webSwitchRow, studioSettings.switchRow, studioSettings.switchText)}>
            <Switch
              checked={game.generateBackgroundImage}
              disabled={!hasImageProvider}
              onCheckedChange={(checked) => setField("generateBackgroundImage", checked)}
            />
            {t("backgroundImageToggle")}
          </label>
          {hasImageProvider === false && (
            <p className={studioSettings.note}>
              {t("backgroundImageNeedsProvider")}{" "}
              <Link
                href="/parent/settings/ai-providers"
                className={cn(studioSettings.link, studioSettings.webLink)}
              >
                {t("openSettings")}
              </Link>
            </p>
          )}
        </div>
      </Field>

      <Field
        label={t("previewImageLabel")}
        hint={hasImageProvider === false ? undefined : t("previewImageHint")}
      >
        <label className={cn(studioSettings.webSwitchRow, studioSettings.switchRow, studioSettings.switchText)}>
          <Switch
            checked={game.generatePreviewImage}
            disabled={!hasImageProvider}
            onCheckedChange={(checked) => setField("generatePreviewImage", checked)}
          />
          {t("previewImageToggle")}
        </label>
      </Field>

      <ListingTranslationsField
        entries={listingTranslations.entries}
        sourceLocale={listingSourceLocale}
        onChange={listingTranslations.setEntry}
      />

      {/* The settings form owns the save action — the built game auto-saves, so
          there is no global Save button. A planning draft shows "Save & start
          building" (its Dodi panel is still hidden until the settings are saved);
          an existing game shows "Save changes". A planning draft's save failures
          surface here since its composer is hidden; an existing game keeps its
          visible Dodi-panel error. */}
      <div className={cn(studioSettings.webSave, studioSettings.save)}>
        {isPlanning && error && (
          <div className={cn(studioSettings.saveError, studioSettings.saveErrorText)}>
            {error}
          </div>
        )}
        {isPlanning && hasAcceptedPlan && (
          <p className={studioSettings.note}>{t("planBuildHint")}</p>
        )}
        <Button
          size="lg"
          className="w-full"
          onClick={onSave}
          disabled={saving || (isPlanning && !game.title.trim())}
        >
          {justSaved ? (
            <>
              <Icon name="check" size={16} />
              {t("saved")}
            </>
          ) : !isPlanning ? (
            t("saveChanges")
          ) : (
            <>
              <Icon name="sparkles" size={16} />
              {t("saveAndBuild")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(studioSettings.webField, studioSettings.field)}>
      <div className={cn(studioSettings.webLabelRow, studioSettings.labelRow)}>
        <label className={studioSettings.label}>
          {label}
          {required ? <RequiredMark /> : null}
        </label>
      </div>
      {children}
      {hint && <p className={studioSettings.hint}>{hint}</p>}
    </div>
  );
}

